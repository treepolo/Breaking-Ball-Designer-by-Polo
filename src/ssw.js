import * as THREE from 'three';
import { R, SEAM_POINTS, SSW_ROTATION_STEPS, SSW_BINS, SSW_SLICE_COUNT, DEG2RAD, SEAM_TUBE_RADIUS } from './constants.js';

/**
 * SSW computation.
 *
 * Detection: point-proximity (|p.z - zPlane| < epsilon).
 *
 * Asymmetry rules (per user spec):
 *   1. Judgment line on SSW plane, through center, PERPENDICULAR to spin axis projection.
 *   2. Split histogram into two halves by this line.
 *   3. Asymmetry index = |sumA - sumB| (raw difference of total presence sums).
 *   4. Force direction: FROM the side with MORE seam presence TO the side with LESS.
 *
 * SSW Effect Index:
 *   Each seam point in the SSW judgment zone contributes based on its z-position
 *   relative to the 5 planes. The effect index is the difference between the two
 *   half-sphere SSW indices split by the judgment line.
 *
 * 5 planes (front→back): 直接分離起點 ≤ 誘發分離區 ≤ 誘發分離起點 ≤ 自然分離區 ≤ 誘發分離終點
 */
export function computeSSW(seamPts, orientX, orientY, orientZ, spinDirection, gyroAngle,
    alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg) {

    // z-coordinates for all 5 planes
    const zDirectSepStart = R * Math.sin(alphaFrontDeg * DEG2RAD);  // 直接分離起點
    const zInducedZone = R * Math.sin(inducedZoneDeg * DEG2RAD); // 誘發分離區
    const zInducedStart = R * Math.sin(inducedStartDeg * DEG2RAD);// 誘發分離起點
    const zNaturalZone = R * Math.sin(naturalZoneDeg * DEG2RAD); // 自然分離區
    const zInducedEnd = R * Math.sin(alphaBackDeg * DEG2RAD);   // 誘發分離終點

    // ── Generate 50 slices evenly distributed in the SSW judgment zone ──
    const zMin = Math.min(zDirectSepStart, zInducedEnd);
    const zMax = Math.max(zDirectSepStart, zInducedEnd);
    const numSlices = SSW_SLICE_COUNT;
    const zPlanes = [];
    for (let s = 0; s < numSlices; s++) {
        const t = numSlices === 1 ? 0.5 : s / (numSlices - 1);
        zPlanes.push(zMin + (zMax - zMin) * t);
    }

    // Spin axis quaternion
    const cg = Math.cos(gyroAngle), sg = Math.sin(gyroAngle);
    const cs = Math.cos(spinDirection), ss = Math.sin(spinDirection);
    const spinAxisDir = new THREE.Vector3(cg * cs, cg * ss, sg).normalize();
    const spinAxisQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), spinAxisDir);
    const initQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(orientX, orientY, orientZ, 'XYZ'));

    // Per-slice seam presence histogram
    const histData = new Float32Array(numSlices * SSW_BINS);
    // Per-slice SSW contribution histogram
    const contribData = new Float32Array(numSlices * SSW_BINS);
    const present = new Uint8Array(numSlices * SSW_BINS);
    const epsilon = SEAM_TUBE_RADIUS * 1.5;

    const p = new THREE.Vector3();
    const localAxis = new THREE.Vector3(1, 0, 0);

    // ── SSW Effect Index accumulators ──────────────────
    const TWO_PI = Math.PI * 2;
    const judgmentAngle = spinDirection + Math.PI / 2;
    const L_bin = Math.round((judgmentAngle / TWO_PI) * SSW_BINS);

    let effectSumA = 0, effectSumB = 0;

    for (let step = 0; step < SSW_ROTATION_STEPS; step++) {
        const angle = (step / SSW_ROTATION_STEPS) * Math.PI * 2;
        const spinQuat = new THREE.Quaternion().setFromAxisAngle(localAxis, angle);
        const mid = spinQuat.clone().multiply(initQuat);
        const fullQuat = spinAxisQuat.clone().multiply(mid);

        present.fill(0);

        for (let i = 0; i < SEAM_POINTS; i++) {
            const i3 = i * 3;
            p.set(seamPts[i3], seamPts[i3 + 1], seamPts[i3 + 2]).applyQuaternion(fullQuat);

            // ── Histogram per-slice ──────────────────────
            for (let s = 0; s < numSlices; s++) {
                if (Math.abs(p.z - zPlanes[s]) < epsilon) {
                    let ang = Math.atan2(p.y, p.x);
                    if (ang < 0) ang += Math.PI * 2;
                    const bin = Math.floor((ang / (Math.PI * 2)) * SSW_BINS) % SSW_BINS;
                    const idx = s * SSW_BINS + bin;
                    present[idx] = 1;

                    // Compute SSW contribution at this z-position (order-independent)
                    const pzS = zPlanes[s];
                    let sliceContrib = 0;
                    // Zone check: pzS between zDirectSepStart and zInducedEnd
                    const jMin = Math.min(zDirectSepStart, zInducedEnd);
                    const jMax = Math.max(zDirectSepStart, zInducedEnd);
                    if (pzS > jMin && pzS < jMax) {
                        // Sub-zone: between directSepStart and inducedStart?
                        const dMin = Math.min(zDirectSepStart, zInducedStart);
                        const dMax = Math.max(zDirectSepStart, zInducedStart);
                        if (pzS >= dMin && pzS <= dMax) {
                            sliceContrib = Math.abs(pzS - zInducedEnd);
                        } else {
                            sliceContrib = Math.abs(zInducedZone - zInducedEnd);
                        }
                    }
                    if (sliceContrib > 0) {
                        contribData[idx] += sliceContrib;
                    }
                }
            }

            // ── SSW Effect Index contribution (order-independent) ──
            const pz = p.z;
            const judgeMin = Math.min(zDirectSepStart, zInducedEnd);
            const judgeMax = Math.max(zDirectSepStart, zInducedEnd);
            if (pz > judgeMin && pz < judgeMax) {
                let contribution = 0;

                const dirMin = Math.min(zDirectSepStart, zInducedStart);
                const dirMax = Math.max(zDirectSepStart, zInducedStart);
                if (pz >= dirMin && pz <= dirMax) {
                    // Direct separation zone
                    contribution = Math.abs(pz - zInducedEnd);
                } else {
                    // Induced separation judgment zone
                    contribution = Math.abs(zInducedZone - zInducedEnd);
                }

                // Determine which half-sphere this point belongs to
                let ang = Math.atan2(p.y, p.x);
                if (ang < 0) ang += TWO_PI;
                const side = Math.sin(ang - judgmentAngle);

                const weightedContrib = contribution / SSW_ROTATION_STEPS;
                if (side >= 0) effectSumA += weightedContrib;
                else effectSumB += weightedContrib;
            }
        }

        for (let k = 0; k < numSlices * SSW_BINS; k++) {
            histData[k] += present[k];
        }
    }

    // SSW Effect Index = |halfA - halfB|
    const sswEffectIndex = Math.abs(effectSumA - effectSumB);

    // Normalize presence histogram to percentage [0,1]
    for (let k = 0; k < numSlices * SSW_BINS; k++) {
        histData[k] /= SSW_ROTATION_STEPS;
    }

    // Normalize contribution histogram by rotation steps
    for (let k = 0; k < numSlices * SSW_BINS; k++) {
        contribData[k] /= SSW_ROTATION_STEPS;
    }

    // Per-slice histograms
    const histograms = [];
    const contribHistograms = [];
    for (let s = 0; s < numSlices; s++) {
        histograms.push(histData.slice(s * SSW_BINS, (s + 1) * SSW_BINS));
        contribHistograms.push(contribData.slice(s * SSW_BINS, (s + 1) * SSW_BINS));
    }

    // Combined: average across slices
    const combinedHist = new Float32Array(SSW_BINS);
    const combinedContrib = new Float32Array(SSW_BINS);
    for (let b = 0; b < SSW_BINS; b++) {
        let sumH = 0, sumC = 0;
        for (let s = 0; s < numSlices; s++) {
            sumH += histograms[s][b];
            sumC += contribHistograms[s][b];
        }
        combinedHist[b] = sumH / numSlices;
        combinedContrib[b] = sumC / numSlices;
    }

    // Max possible SSW contribution (for legend scale)
    const maxContribution = Math.abs(zDirectSepStart - zNaturalZone);

    // ── Asymmetry per user spec ────────────────────────
    // 1. "Asymmetry Index" (for UI display of Seam Asymmetry) based on Presence
    const targetHist = combinedHist;
    let sumA = 0, sumB = 0;
    for (let i = 0; i < SSW_BINS; i++) {
        const binAngle = (i / SSW_BINS) * TWO_PI;
        const side = Math.sin(binAngle - judgmentAngle);
        if (side >= 0) sumA += targetHist[i];
        else sumB += targetHist[i];
    }
    const asymmetryIndex = Math.abs(sumA - sumB);

    // 2. "SSW Force Direction" (Clock) based on SSW Contribution
    // Logic: From Higher SSW Index (Contribution) TO Lower SSW Index
    const effectHist = combinedContrib;
    let wx = 0, wy = 0;
    for (let i = 0; i < SSW_BINS; i++) {
        const binAngle = (i / SSW_BINS) * TWO_PI;
        // Symmetric counterpart across judgment line
        const j = ((2 * L_bin - i) % SSW_BINS + SSW_BINS) % SSW_BINS;

        // Difference in SSW Contribution
        const diff = effectHist[i] - effectHist[j];

        // Accumulate vectors pointing towards the stronger side
        wx += diff * Math.cos(binAngle);
        wy += diff * Math.sin(binAngle);
    }

    // We want arrow from High -> Low.
    // (wx, wy) points to High (Weighted Center of Contribution).
    // So point Opposite: (-wx, -wy).
    let arrowAngle = Math.atan2(-wy, -wx);
    if (arrowAngle < 0) arrowAngle += TWO_PI;
    const arrowWidth = Math.PI / 4;

    return {
        histograms, combined: combinedHist,
        contribHistograms, combinedContrib,
        asymmetryIndex, arrowAngle, arrowWidth,
        numSlices, zPlanes,
        sswEffectIndex, maxContribution,
        effectSumA, effectSumB, // Return hemisphere sums
    };
}

/** Convert math angle (rad, 0=+X CCW) to clock string. */
export function angleToClockString(angle) {
    let deg = (180 - angle * (180 / Math.PI));
    deg = ((deg % 360) + 360) % 360;
    const totalMin = (deg / 360) * 720;
    const h = Math.floor(totalMin / 60) || 12;
    const m = Math.floor(totalMin % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}
