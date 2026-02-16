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
    const k = 0.28;   // narrowed base wave
    const m = 0.06;   // 5th harmonic, proportionally scaled
    const h = 1.8;    // raised Z height → sphere projection squeezes inward
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

/* ── Sphere-conforming patch & Canvas text logos ────── */

/**
 * Create a sphere-conforming rectangular patch.
 * @param {boolean} rotate90  If true, rotate texture 90° so horizontal text appears vertical on ball
 */
function createSpherePatch(r, center, halfW, halfH, segsW, segsH, rotate90 = false) {
    const N = center.clone().normalize();
    const ref = Math.abs(N.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const U = new THREE.Vector3().crossVectors(N, ref).normalize();
    const V = new THREE.Vector3().crossVectors(U, N).normalize();

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let iy = 0; iy <= segsH; iy++) {
        const v = iy / segsH;
        const angleV = (v - 0.5) * 2 * halfH;
        for (let ix = 0; ix <= segsW; ix++) {
            const u = ix / segsW;
            const angleU = (u - 0.5) * 2 * halfW;

            const dir = N.clone();
            dir.applyAxisAngle(V, angleU);
            dir.applyAxisAngle(U, -angleV);
            dir.normalize().multiplyScalar(r);

            positions.push(dir.x, dir.y, dir.z);

            if (rotate90) {
                uvs.push(v, u); // 90° CW: canvas left→patch top, canvas right→patch bottom
            } else {
                uvs.push(u, 1 - v);
            }
        }
    }

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

/* ── Canvas-drawn text textures (transparent bg) ────── */

function createDarkText() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "TREE" in green
    ctx.fillStyle = '#00A651';
    ctx.font = 'bold 110px Arial, sans-serif';
    ctx.fillText('TREE', 256, 85);

    // "POLO" in lime green
    ctx.fillStyle = '#ADFF2F';
    ctx.font = 'bold 110px Arial, sans-serif';
    ctx.fillText('POLO', 256, 195);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function createLightText() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "TREEPOLO" in green
    ctx.fillStyle = '#00A651';
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.fillText('TREEPOLO', 256, 65);

    // "About Science of Baseball" in black
    ctx.fillStyle = '#000000';
    ctx.font = '34px Arial, sans-serif';
    ctx.fillText('About Science of Baseball', 256, 145);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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

    // ── Text logos (Canvas, transparent bg, rotated 90°) ──
    // Both on the front face (+Z), separated by the seam.
    // UV rotate90 = true maps horizontal canvas text to vertical on the ball.
    const logoR = R * 1.004;
    const tiltAngle = 0.30; // ~17° above/below centre

    // Dark text — above seam (tall narrow patch, 3x text)
    const darkCenter = new THREE.Vector3(0, Math.sin(tiltAngle), Math.cos(tiltAngle)).normalize();
    const darkGeo = createSpherePatch(logoR, darkCenter, 0.18, 0.52, 24, 24, true);
    const darkTex = createDarkText();
    const darkMat = new THREE.MeshBasicMaterial({ map: darkTex, transparent: true, depthWrite: false });
    const darkLogo = new THREE.Mesh(darkGeo, darkMat);
    darkLogo.name = 'LogoDark';
    ballOrientationGroup.add(darkLogo);

    // Light text — below seam (tall narrow patch, 2x text)
    const lightCenter = new THREE.Vector3(0, -Math.sin(tiltAngle), Math.cos(tiltAngle)).normalize();
    const lightGeo = createSpherePatch(logoR, lightCenter, 0.16, 0.46, 24, 24, true);
    const lightTex = createLightText();
    const lightMat = new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, depthWrite: false });
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
