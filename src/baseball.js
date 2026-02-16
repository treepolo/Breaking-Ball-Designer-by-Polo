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
 */
export function computeSeamPoints() {
    const k = 0.35;   // base wave coefficient
    const m = 0.08;   // 5th harmonic – flattens U-bend sides
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

/* ── Logo helpers ─────────────────────────────────────── */

const loader = new THREE.TextureLoader();

/**
 * Create a sphere-conforming rectangular patch.
 * @param {number} r       Sphere radius (slightly > R for offset)
 * @param {THREE.Vector3} center  Unit direction vector pointing to patch center
 * @param {number} halfW   Half angular width (radians)
 * @param {number} halfH   Half angular height (radians)
 * @param {number} segsW   Horizontal segments
 * @param {number} segsH   Vertical segments
 * @param {number} cornerR Corner radius in [0..1] relative to half-size
 */
function createSpherePatch(r, center, halfW, halfH, segsW, segsH, cornerR = 0) {
    // Build a coordinate frame: N = center, U = "right", V = "up"
    const N = center.clone().normalize();
    // Pick an arbitrary "up-ish" reference that isn't parallel to N
    const ref = Math.abs(N.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const U = new THREE.Vector3().crossVectors(N, ref).normalize(); // right
    const V = new THREE.Vector3().crossVectors(U, N).normalize();   // up

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let iy = 0; iy <= segsH; iy++) {
        const v = iy / segsH; // 0..1
        const angleV = (v - 0.5) * 2 * halfH; // [-halfH, halfH]
        for (let ix = 0; ix <= segsW; ix++) {
            const u = ix / segsW; // 0..1
            const angleU = (u - 0.5) * 2 * halfW; // [-halfW, halfW]

            // Rounded corner mask — skip vertices outside rounded rect
            if (cornerR > 0) {
                const cu = Math.abs(u - 0.5) * 2; // 0..1 from center
                const cv = Math.abs(v - 0.5) * 2;
                const cr = cornerR;
                if (cu > 1 - cr && cv > 1 - cr) {
                    const dx = (cu - (1 - cr)) / cr;
                    const dy = (cv - (1 - cr)) / cr;
                    // Soft alpha handled by texture; geometry stays rectangular
                }
            }

            // Spherical interpolation: rotate N by angleU around V, then by angleV around U
            const dir = N.clone();
            dir.applyAxisAngle(V, angleU);
            dir.applyAxisAngle(U, -angleV);
            dir.normalize().multiplyScalar(r);

            positions.push(dir.x, dir.y, dir.z);
            uvs.push(u, 1 - v); // flip V so top of texture = top of patch
        }
    }

    // Build triangle indices
    for (let iy = 0; iy < segsH; iy++) {
        for (let ix = 0; ix < segsW; ix++) {
            const a = iy * (segsW + 1) + ix;
            const b = a + 1;
            const c = a + (segsW + 1);
            const d = c + 1;
            indices.push(a, d, b);
            indices.push(a, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Create the baseball group hierarchy and return references.
 */
export function createBaseball() {
    const spinAxisGroup = new THREE.Group();
    spinAxisGroup.name = 'SpinAxisGroup';

    const ballOrientationGroup = new THREE.Group();
    ballOrientationGroup.name = 'BallOrientationGroup';
    spinAxisGroup.add(ballOrientationGroup);

    // ── Ball mesh ──────────────────────────────────────────
    const ballGeo = new THREE.SphereGeometry(R, 64, 64);
    const ballMat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f0, roughness: 0.55, metalness: 0.02,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.name = 'BallMesh';
    ballOrientationGroup.add(ballMesh);

    // ── Seam (semi-embedded stitch) ────────────────────────
    const seamPts = computeSeamPoints();
    const sinkFactor = SEAM_TUBE_RADIUS * 0.5;
    const seamVectors = [];
    for (let i = 0; i < SEAM_POINTS; i++) {
        const x = seamPts[i * 3];
        const y = seamPts[i * 3 + 1];
        const z = seamPts[i * 3 + 2];
        const len = Math.sqrt(x * x + y * y + z * z);
        seamVectors.push(new THREE.Vector3(
            x - (x / len) * sinkFactor,
            y - (y / len) * sinkFactor,
            z - (z / len) * sinkFactor
        ));
    }
    const seamCurve = new THREE.CatmullRomCurve3(seamVectors, true);
    const seamGeo = new THREE.TubeGeometry(seamCurve, SEAM_POINTS, SEAM_TUBE_RADIUS, 8, true);
    const seamMat = new THREE.MeshStandardMaterial({
        color: 0xcc2200, roughness: 0.6, metalness: 0.05,
        emissive: 0x330000, emissiveIntensity: 0.15,
    });
    const seamMesh = new THREE.Mesh(seamGeo, seamMat);
    seamMesh.name = 'SeamMesh';
    ballOrientationGroup.add(seamMesh);

    // ── Logos (sphere-conforming patches) ──────────────────
    // Both logos on the front face (+Z direction), separated by seam:
    //   Dark logo: above the seam centre (+Z, tilted slightly toward +Y)
    //   Light logo: below the seam centre (+Z, tilted slightly toward -Y)
    const logoR = R * 1.004; // just above surface
    const tiltAngle = 0.28;  // ~16° above/below centre

    // Dark logo — square, above seam
    const darkCenter = new THREE.Vector3(0, Math.sin(tiltAngle), Math.cos(tiltAngle)).normalize();
    const darkGeo = createSpherePatch(logoR, darkCenter, 0.22, 0.22, 24, 24);
    const darkTex = loader.load('./logo-dark.jpg');
    darkTex.colorSpace = THREE.SRGBColorSpace;
    const darkMat = new THREE.MeshBasicMaterial({ map: darkTex });
    const darkLogo = new THREE.Mesh(darkGeo, darkMat);
    darkLogo.name = 'LogoDark';
    ballOrientationGroup.add(darkLogo);

    // Light logo — wider rectangle, below seam (flipped to read correctly)
    const lightCenter = new THREE.Vector3(0, -Math.sin(tiltAngle), Math.cos(tiltAngle)).normalize();
    const lightGeo = createSpherePatch(logoR, lightCenter, 0.30, 0.18, 24, 24);
    const lightTex = loader.load('./logo-light.png');
    lightTex.colorSpace = THREE.SRGBColorSpace;
    const lightMat = new THREE.MeshBasicMaterial({ map: lightTex });
    const lightLogo = new THREE.Mesh(lightGeo, lightMat);
    lightLogo.name = 'LogoLight';
    ballOrientationGroup.add(lightLogo);

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
