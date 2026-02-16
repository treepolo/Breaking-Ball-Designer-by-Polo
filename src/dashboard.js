import * as THREE from 'three';
import { R, SSW_BINS, DASHBOARD_GAP, DASHBOARD_HEAT_WIDTH, DASHBOARD_INFO_WIDTH, SEAM_TUBE_RADIUS, DEG2RAD } from './constants.js';

const RING_THICKNESS = SEAM_TUBE_RADIUS / 4; // base thickness for combined mode

/**
 * Dashboard ring — volumetric 3D ring (front+back+inner+outer faces).
 * Combined: ring at z=0 with RING_THICKNESS depth.
 * Separate: ring from zFront to zBack, min thickness = RING_THICKNESS.
 */
export class Dashboard {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'DashboardGroup';
        scene.add(this.group);

        this.ringMesh = null;
        this.arrowMesh = null;
        this.glowRing = null;
        this._buildRing();
        this._buildArrow();
        this._buildGlowRing();
    }

    _buildRing() {
        // 4 faces × 6 verts = 24 per bin
        const maxVerts = SSW_BINS * 24;
        const positions = new Float32Array(maxVerts * 3);
        const colors = new Float32Array(maxVerts * 4);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
        const mat = new THREE.ShaderMaterial({
            vertexShader: `
        attribute vec4 aColor;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        varying vec4 vColor;
        void main() {
          if (vColor.a < 0.01) discard;
          gl_FragColor = vColor;
        }`,
            transparent: true, side: THREE.DoubleSide, depthWrite: false,
        });
        this.ringMesh = new THREE.Mesh(geo, mat);
        this.ringMesh.renderOrder = 1;
        this.group.add(this.ringMesh);
    }

    _buildGlowRing() {
        const innerR = R + DASHBOARD_GAP;
        const outerR = innerR + DASHBOARD_HEAT_WIDTH + DASHBOARD_INFO_WIDTH;
        const geo = new THREE.RingGeometry(innerR - 0.01, outerR + 0.01, 128);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide, depthWrite: false,
        });
        this.glowRing = new THREE.Mesh(geo, mat);
        this.glowRing.renderOrder = 0;
        this.group.add(this.glowRing);
    }

    _buildArrow() {
        const shape = new THREE.Shape();
        shape.moveTo(0.15, 0);
        shape.lineTo(-0.05, 0.08);
        shape.lineTo(0.02, 0);
        shape.lineTo(-0.05, -0.08);
        shape.closePath();
        const mat = new THREE.MeshBasicMaterial({
            color: 0x3b82f6, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        this.arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
        this.arrowMesh.visible = false;
        this.arrowMesh.renderOrder = 3;
        this.group.add(this.arrowMesh);
    }

    update(mode, histograms, combined, numSlices, zPlanes, asymmetryIndex, arrowAngle, arrowWidth) {
        const innerR = R + DASHBOARD_GAP;
        const heatOuter = innerR + DASHBOARD_HEAT_WIDTH;
        const totalOuter = heatOuter + DASHBOARD_INFO_WIDTH;

        // Glow ring
        if (this.glowRing) {
            this.glowRing.geometry.dispose();
            this.glowRing.geometry = new THREE.RingGeometry(innerR - 0.01, totalOuter + 0.01, 128);
            this.glowRing.position.z = 0;
        }

        // Determine z-extent
        let zMin, zMax;
        if (mode === 'combined') {
            zMin = -RING_THICKNESS / 2;
            zMax = RING_THICKNESS / 2;
        } else {
            // Separate: fill boundary range, min thickness = RING_THICKNESS
            const zF = zPlanes[0];
            const zB = zPlanes[zPlanes.length - 1];
            const halfT = Math.max(Math.abs(zB - zF), RING_THICKNESS) / 2;
            const center = (zF + zB) / 2;
            zMin = center - halfT;
            zMax = center + halfT;
        }

        const posArr = this.ringMesh.geometry.getAttribute('position').array;
        const colArr = this.ringMesh.geometry.getAttribute('aColor').array;
        let vertIdx = 0;

        // Use combined histogram for coloring (both modes)
        const hist = combined;

        for (let i = 0; i < SSW_BINS; i++) {
            const a0 = (i / SSW_BINS) * Math.PI * 2;
            const a1 = a0 + (Math.PI * 2) / SSW_BINS;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);

            // Corner positions
            const ilf = [c0 * innerR, s0 * innerR, zMax]; // inner-left-front
            const olf = [c0 * heatOuter, s0 * heatOuter, zMax]; // outer-left-front
            const orf = [c1 * heatOuter, s1 * heatOuter, zMax]; // outer-right-front
            const irf = [c1 * innerR, s1 * innerR, zMax]; // inner-right-front
            const ilb = [c0 * innerR, s0 * innerR, zMin]; // inner-left-back
            const olb = [c0 * heatOuter, s0 * heatOuter, zMin]; // outer-left-back
            const orb = [c1 * heatOuter, s1 * heatOuter, zMin]; // outer-right-back
            const irb = [c1 * innerR, s1 * innerR, zMin]; // inner-right-back

            const val = hist[i];
            const hc = val > 0.001 ? heatColor(val) : null;
            const r = hc ? hc.r : 0, g = hc ? hc.g : 0, b = hc ? hc.b : 0;
            const a = hc ? 1.0 : 0;

            // Front face (zMax): ilf, olf, orf,  ilf, orf, irf
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, olf, orf, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, orf, irf, r, g, b, a);
            // Back face (zMin): ilb, orb, olb,  ilb, irb, orb
            vertIdx = setTri(posArr, colArr, vertIdx, ilb, orb, olb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilb, irb, orb, r, g, b, a);
            // Outer wall: olf, olb, orb,  olf, orb, orf
            vertIdx = setTri(posArr, colArr, vertIdx, olf, olb, orb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, olf, orb, orf, r, g, b, a);
            // Inner wall: ilf, irb, ilb,  ilf, irf, irb
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, irb, ilb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, irf, irb, r, g, b, a);
        }

        this.ringMesh.geometry.getAttribute('position').needsUpdate = true;
        this.ringMesh.geometry.getAttribute('aColor').needsUpdate = true;
        this.ringMesh.geometry.setDrawRange(0, vertIdx);

        // Arrow — 5x larger, inner edge outside dashboard
        if (asymmetryIndex > 0.01) {
            this.arrowMesh.visible = true;
            const arrowR = totalOuter + 0.22; // position outside dashboard
            this.arrowMesh.position.set(Math.cos(arrowAngle) * arrowR, Math.sin(arrowAngle) * arrowR, 0.002);
            const sc = DASHBOARD_INFO_WIDTH * 25; // 10x original
            this.arrowMesh.scale.set(sc, sc, 1);
            this.arrowMesh.rotation.z = arrowAngle;
            this.arrowMesh.material.opacity = Math.min(0.9, 0.3 + asymmetryIndex * 2);
        } else {
            this.arrowMesh.visible = false;
        }
    }
}

function setTri(posArr, colArr, idx, p1, p2, p3, r, g, b, a) {
    const pb = idx * 3;
    posArr[pb] = p1[0]; posArr[pb + 1] = p1[1]; posArr[pb + 2] = p1[2];
    posArr[pb + 3] = p2[0]; posArr[pb + 4] = p2[1]; posArr[pb + 5] = p2[2];
    posArr[pb + 6] = p3[0]; posArr[pb + 7] = p3[1]; posArr[pb + 8] = p3[2];
    const cb = idx * 4;
    for (let v = 0; v < 3; v++) {
        colArr[cb + v * 4] = r;
        colArr[cb + v * 4 + 1] = g;
        colArr[cb + v * 4 + 2] = b;
        colArr[cb + v * 4 + 3] = a;
    }
    return idx + 3;
}

/** Continuous rainbow: 0% = blue → cyan → green → yellow → 100% = red. */
function heatColor(t) {
    const hue = (1 - t) * 240;
    return hsvToRgb(hue, 1.0, 1.0);
}

function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: r + m, g: g + m, b: b + m };
}
