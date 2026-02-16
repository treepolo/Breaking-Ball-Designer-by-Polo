import * as THREE from 'three';
import {
    R, SEAM_POINTS, SEAM_TUBE_RADIUS, AXIS_EXTEND,
} from './constants.js';

/**
 * Compute seam curve points projected onto a unit sphere.
 * Uses improved sphere-projected parametric equation with 5th harmonic:
 *   x0 = cos(t) - k·cos(3t) + m·cos(5t)
 *   y0 = sin(t) + k·sin(3t) + m·sin(5t)
 *   z0 = h·cos(2t)
 *   (x, y, z) = (x0, y0, z0) / ||(x0, y0, z0)||  (then scaled by R)
 * Returns Float32Array of [x, y, z, ...] with SEAM_POINTS entries.
 */
export function computeSeamPoints() {
    const k = 0.35;   // base wave coefficient
    const m = 0.08;   // 5th harmonic coefficient – flattens U-bend sides
    const h = 1.5;    // controls narrow-waist distance
    const pts = new Float32Array(SEAM_POINTS * 3);
    for (let i = 0; i < SEAM_POINTS; i++) {
        const t = (i / SEAM_POINTS) * Math.PI * 2;
        const x0 = Math.cos(t) - k * Math.cos(3 * t) + m * Math.cos(5 * t);
        const y0 = Math.sin(t) + k * Math.sin(3 * t) + m * Math.sin(5 * t);
        const z0 = h * Math.cos(2 * t);
        const d = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
        pts[i * 3] = (x0 / d) * R;
        pts[i * 3 + 1] = (y0 / d) * R;
        pts[i * 3 + 2] = (z0 / d) * R;
    }
    return pts;
}

/**
 * Create the baseball nested group hierarchy and return references.
 */
export function createBaseball() {
    // ── Outer group: SpinAxisGroup ─────────────────────────
    const spinAxisGroup = new THREE.Group();
    spinAxisGroup.name = 'SpinAxisGroup';

    // ── Inner group: BallOrientationGroup ──────────────────
    const ballOrientationGroup = new THREE.Group();
    ballOrientationGroup.name = 'BallOrientationGroup';
    spinAxisGroup.add(ballOrientationGroup);

    // ── Ball mesh ──────────────────────────────────────────
    const ballGeo = new THREE.SphereGeometry(R, 64, 64);
    const ballMat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f0,
        roughness: 0.55,
        metalness: 0.02,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.name = 'BallMesh';
    ballOrientationGroup.add(ballMesh);

    // ── Seam (semi-embedded stitch) ────────────────────────
    // Sink the tube center inward by half the tube radius so that
    // the bottom half sits inside the ball and only the top half protrudes.
    const seamPts = computeSeamPoints();
    const sinkFactor = SEAM_TUBE_RADIUS * 0.5; // how deep to embed
    const seamVectors = [];
    for (let i = 0; i < SEAM_POINTS; i++) {
        const x = seamPts[i * 3];
        const y = seamPts[i * 3 + 1];
        const z = seamPts[i * 3 + 2];
        // Normal at surface point = normalized position (sphere)
        const len = Math.sqrt(x * x + y * y + z * z);
        // Move center inward along surface normal
        seamVectors.push(new THREE.Vector3(
            x - (x / len) * sinkFactor,
            y - (y / len) * sinkFactor,
            z - (z / len) * sinkFactor
        ));
    }
    const seamCurve = new THREE.CatmullRomCurve3(seamVectors, true);
    const seamGeo = new THREE.TubeGeometry(seamCurve, SEAM_POINTS, SEAM_TUBE_RADIUS, 8, true);
    const seamMat = new THREE.MeshStandardMaterial({
        color: 0xcc2200,
        roughness: 0.6,
        metalness: 0.05,
        emissive: 0x330000,
        emissiveIntensity: 0.15,
    });
    const seamMesh = new THREE.Mesh(seamGeo, seamMat);
    seamMesh.name = 'SeamMesh';
    ballOrientationGroup.add(seamMesh);

    // ── Spin axis line ─────────────────────────────────────
    const axisLen = R + AXIS_EXTEND * R; // 1.3R
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLen, 0, 0),
        new THREE.Vector3(axisLen, 0, 0),
    ]);
    const axisMat = new THREE.LineBasicMaterial({
        color: 0x8899cc,
        linewidth: 1,
        transparent: true,
        opacity: 0.7,
    });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    axisLine.name = 'SpinAxisLine';
    spinAxisGroup.add(axisLine); // child of outer group, won't spin with ball

    return {
        spinAxisGroup,
        ballOrientationGroup,
        ballMesh,
        seamMesh,
        axisLine,
        seamPointsRaw: seamPts,
    };
}

/**
 * Update SpinAxisGroup quaternion from spin direction & gyro angle.
 * Spin axis in world space:
 *   dir = (cos(gyro)·cos(spinDir), cos(gyro)·sin(spinDir), sin(gyro))
 * We align local X-axis to this direction.
 */
export function updateSpinAxis(spinAxisGroup, spinDirection, gyroAngle) {
    const cg = Math.cos(gyroAngle);
    const sg = Math.sin(gyroAngle);
    const cs = Math.cos(spinDirection);
    const ss = Math.sin(spinDirection);

    const dir = new THREE.Vector3(cg * cs, cg * ss, sg).normalize();
    const defaultAxis = new THREE.Vector3(1, 0, 0);

    const quat = new THREE.Quaternion().setFromUnitVectors(defaultAxis, dir);
    spinAxisGroup.quaternion.copy(quat);
}

/**
 * Update BallOrientationGroup quaternion combining initial orientation
 * and accumulated animation angle (rotation around parent's local X).
 */
export function updateBallOrientation(
    ballOrientationGroup,
    orientX, orientY, orientZ,
    animationAngle
) {
    const initQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(orientX, orientY, orientZ, 'XYZ')
    );
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        animationAngle
    );
    // Spin first (in parent's local frame), then initial orientation
    ballOrientationGroup.quaternion.copy(spinQuat).multiply(initQuat);
}
