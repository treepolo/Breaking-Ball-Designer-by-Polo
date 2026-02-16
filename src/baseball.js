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
    const a = 0.75;
    const b = 0.25;
    const c = 0.866; // ≈ 2 * sqrt(a * b), curve lies naturally on unit sphere
    const pts = new Float32Array(SEAM_POINTS * 3);
    for (let i = 0; i < SEAM_POINTS; i++) {
        const t = (i / SEAM_POINTS) * Math.PI * 2;
        pts[i * 3] = (a * Math.cos(t) - b * Math.cos(3 * t)) * R;
        pts[i * 3 + 1] = (a * Math.sin(t) + b * Math.sin(3 * t)) * R;
        pts[i * 3 + 2] = c * Math.cos(2 * t) * R;
    }
    return pts;
}

/* ── Sphere-conforming patch & Canvas text logos ────── */

/**
 * Create a sphere-conforming rectangular patch.
 */
function createSpherePatch(r, center, halfW, halfH, segsW, segsH) {
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
            uvs.push(u, 1 - v);
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

/* ── Hi-res Canvas text textures (transparent bg) ───── */

function createDarkText() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "TREE" in green
    ctx.fillStyle = '#009B4D';
    ctx.font = 'bold 200px Arial, sans-serif';
    ctx.fillText('TREE', 512, 170);

    // "POLO" in natural bright green (not neon)
    ctx.fillStyle = '#7CB342';
    ctx.font = 'bold 200px Arial, sans-serif';
    ctx.fillText('POLO', 512, 380);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

function createLightText() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "TREEPOLO" in green
    ctx.fillStyle = '#009B4D';
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.fillText('TREEPOLO', 512, 105);

    // "About Science of Baseball" in dark grey — tight spacing
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '64px Arial, sans-serif';
    ctx.fillText('About Science of Baseball', 512, 200);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
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

    // ── Text logos (Canvas, transparent bg, hi-res) ────────
    const logoR = R * 1.004;
    const DEG60 = Math.PI / 3; // 60°

    // Light text — curved sphere patch at -Z face, 2x size
    const lightCenter = new THREE.Vector3(0, 0, -1);
    const lightGeo = createSpherePatch(logoR, lightCenter, 0.40, 0.24, 32, 32);
    const lightTex = createLightText();
    const lightMat = new THREE.MeshBasicMaterial({ map: lightTex, transparent: true, depthWrite: false });
    const lightLogo = new THREE.Mesh(lightGeo, lightMat);
    lightLogo.name = 'LogoLight';
    ballOrientationGroup.add(lightLogo);

    // Dark text — 60° above white logo (rotated 180° around Y)
    const darkCenter = new THREE.Vector3(0, Math.sin(DEG60), -Math.cos(DEG60)).normalize();
    const darkGeo = createSpherePatch(logoR, darkCenter, 0.32, 0.20, 32, 32);
    const darkTex = createDarkText();
    const darkMat = new THREE.MeshBasicMaterial({ map: darkTex, transparent: true, depthWrite: false });
    const darkLogo = new THREE.Mesh(darkGeo, darkMat);
    darkLogo.name = 'LogoDark';
    ballOrientationGroup.add(darkLogo);

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
