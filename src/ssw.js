import * as THREE from 'three';
import { R, SEAM_POINTS, SSW_ROTATION_STEPS, SSW_BINS, SSW_MAX_SLICES, DEG2RAD, SEAM_TUBE_RADIUS } from './constants.js';

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
 */
export function computeSSW(seamPts, orientX, orientY, orientZ, spinDirection, gyroAngle, alphaFrontDeg, alphaBackDeg) {
    const aF = Math.min(alphaFrontDeg, alphaBackDeg);
    const aB = Math.max(alphaFrontDeg, alphaBackDeg);
    const span = Math.abs(aB - aF);
    const numSlices = Math.max(1, Math.min(SSW_MAX_SLICES, Math.round(span)));

    const zPlanes = [];
    for (let s = 0; s < numSlices; s++) {
        const a = numSlices === 1 ? (aF + aB) / 2 : aF + (aB - aF) * s / (numSlices - 1);
        zPlanes.push(R * Math.sin(a * DEG2RAD));
    }

    // Spin axis quaternion
    const cg = Math.cos(gyroAngle), sg = Math.sin(gyroAngle);
    const cs = Math.cos(spinDirection), ss = Math.sin(spinDirection);
    const spinAxisDir = new THREE.Vector3(cg * cs, cg * ss, sg).normalize();
    const spinAxisQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), spinAxisDir);
    const initQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(orientX, orientY, orientZ, 'XYZ'));

    const histData = new Float32Array(numSlices * SSW_BINS);
    const present = new Uint8Array(numSlices * SSW_BINS);
    const epsilon = SEAM_TUBE_RADIUS * 1.5;

    const p = new THREE.Vector3();
    const localAxis = new THREE.Vector3(1, 0, 0);

    for (let step = 0; step < SSW_ROTATION_STEPS; step++) {
        const angle = (step / SSW_ROTATION_STEPS) * Math.PI * 2;
        const spinQuat = new THREE.Quaternion().setFromAxisAngle(localAxis, angle);
        const mid = spinQuat.clone().multiply(initQuat);
        const fullQuat = spinAxisQuat.clone().multiply(mid);

        present.fill(0);

        for (let i = 0; i < SEAM_POINTS; i++) {
            const i3 = i * 3;
            p.set(seamPts[i3], seamPts[i3 + 1], seamPts[i3 + 2]).applyQuaternion(fullQuat);

            for (let s = 0; s < numSlices; s++) {
                if (Math.abs(p.z - zPlanes[s]) < epsilon) {
                    let ang = Math.atan2(p.y, p.x);
                    if (ang < 0) ang += Math.PI * 2;
                    const bin = Math.floor((ang / (Math.PI * 2)) * SSW_BINS) % SSW_BINS;
                    present[s * SSW_BINS + bin] = 1;
                }
            }
        }

        for (let k = 0; k < numSlices * SSW_BINS; k++) {
            histData[k] += present[k];
        }
    }

    // Normalize to percentage [0,1]
    for (let k = 0; k < numSlices * SSW_BINS; k++) {
        histData[k] /= SSW_ROTATION_STEPS;
    }

    const histograms = [];
    for (let s = 0; s < numSlices; s++) {
        histograms.push(histData.slice(s * SSW_BINS, (s + 1) * SSW_BINS));
    }

    // Combined: average across slices
    const combinedHist = new Float32Array(SSW_BINS);
    for (let b = 0; b < SSW_BINS; b++) {
        let sum = 0;
        for (let s = 0; s < numSlices; s++) sum += histograms[s][b];
        combinedHist[b] = sum / numSlices;
    }

    // ── Asymmetry per user spec ────────────────────────
    const targetHist = combinedHist;
    const TWO_PI = Math.PI * 2;
    const judgmentAngle = spinDirection + Math.PI / 2;

    // Judgment line bin index (integer — avoids all floating-point drift)
    const L_bin = Math.round((judgmentAngle / TWO_PI) * SSW_BINS);

    // Split into two halves by judgment line
    let sumA = 0, sumB = 0;
    for (let i = 0; i < SSW_BINS; i++) {
        const binAngle = (i / SSW_BINS) * TWO_PI;
        const side = Math.sin(binAngle - judgmentAngle);
        if (side >= 0) sumA += targetHist[i];
        else sumB += targetHist[i];
    }

    // Asymmetry index = raw difference of sums
    const asymmetryIndex = Math.abs(sumA - sumB);

    // Force direction: centroid of DIFFERENCE histogram (hist[i] - hist[mirror(i)])
    // Mirror bin computed via INTEGER arithmetic to avoid floating-point rounding errors.
    // Mathematically, symmetric components cancel → centroid naturally aligns with spin axis.
    let wx = 0, wy = 0;
    for (let i = 0; i < SSW_BINS; i++) {
        const binAngle = (i / SSW_BINS) * TWO_PI;
        // Mirror of bin i across judgment line bin L_bin — exact integer arithmetic
        const j = ((2 * L_bin - i) % SSW_BINS + SSW_BINS) % SSW_BINS;
        const diff = targetHist[i] - targetHist[j];
        wx += diff * Math.cos(binAngle);
        wy += diff * Math.sin(binAngle);
    }
    // Centroid of difference → heavy side; force is FROM heavy TO light (opposite)
    let arrowAngle = Math.atan2(-wy, -wx);
    if (arrowAngle < 0) arrowAngle += TWO_PI;
    const arrowWidth = Math.PI / 4;

    return { histograms, combined: combinedHist, asymmetryIndex, arrowAngle, arrowWidth, numSlices, zPlanes };
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
