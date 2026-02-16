import * as THREE from 'three';
import { R, SSW_BINS, DASHBOARD_GAP, DASHBOARD_HEAT_WIDTH, DASHBOARD_CONTRIB_WIDTH, DASHBOARD_INFO_WIDTH, SEAM_TUBE_RADIUS, SSW_SLICE_COUNT } from './constants.js';

const RING_THICKNESS = SEAM_TUBE_RADIUS / 4; // base thickness for combined & slice mode

/**
 * Dashboard rings — seam presence (inner) + SSW contribution (outer).
 * Combined: single ring at z=0 with RING_THICKNESS depth.
 * Slice: 50 thin rings evenly distributed in the SSW judgment zone.
 */
export class Dashboard {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'DashboardGroup';
        scene.add(this.group);

        this.seamRingMesh = null;
        this.contribRingMesh = null;
        this.arrowMesh = null;
        this.glowRing = null;
        this._buildRing('seam');
        this._buildRing('contrib');
        this._buildArrow();
        this._buildGlowRing();

        this.visibleSeam = true;
        this.visibleContrib = true;
    }

    setVisibility(seam, contrib) {
        this.visibleSeam = seam;
        this.visibleContrib = contrib;
        if (this.seamRingMesh) this.seamRingMesh.visible = seam;
        if (this.contribRingMesh) this.contribRingMesh.visible = contrib;
    }

    _buildRing(type) {
        // For slice mode: SSW_SLICE_COUNT × SSW_BINS × 24 verts
        // For combined mode: SSW_BINS × 24 verts
        const maxVerts = SSW_SLICE_COUNT * SSW_BINS * 24;
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
            transparent: true, side: THREE.DoubleSide, depthWrite: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 1;
        this.group.add(mesh);

        if (type === 'seam') this.seamRingMesh = mesh;
        else this.contribRingMesh = mesh;
    }

    _buildGlowRing() {
        const innerR = R + DASHBOARD_GAP;
        const outerR = innerR + DASHBOARD_HEAT_WIDTH + DASHBOARD_CONTRIB_WIDTH + DASHBOARD_INFO_WIDTH;
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

    /**
     * @param {string} mode - 'combined' or 'slice'
     * @param {Float32Array[]} histograms - per-slice seam presence [0,1]
     * @param {Float32Array} combined - combined seam presence [0,1]
     * @param {Float32Array[]} contribHistograms - per-slice SSW contribution
     * @param {Float32Array} combinedContrib - combined SSW contribution
     * @param {number} numSlices
     * @param {number[]} zPlanes
     * @param {number} asymmetryIndex
     * @param {number} arrowAngle
     * @param {number} arrowWidth
     * @param {number} maxContribution - max value for contribution color scale
     * @param {boolean} visibleSeam - passed from update if needed, but we use internal state or method
     * @param {boolean} visibleContrib
     */
    update(mode, histograms, combined, contribHistograms, combinedContrib,
        numSlices, zPlanes, asymmetryIndex, arrowAngle, arrowWidth, maxContribution,
        visibleSeam = true, visibleContrib = true) {

        // Update internal state just in case
        this.setVisibility(visibleSeam, visibleContrib);

        const innerR = R + DASHBOARD_GAP;
        const seamOuter = innerR + DASHBOARD_HEAT_WIDTH;
        const contribInner = seamOuter + 0.02; // small gap
        const contribOuter = contribInner + DASHBOARD_CONTRIB_WIDTH;
        const totalOuter = contribOuter + DASHBOARD_INFO_WIDTH;

        // Glow ring
        if (this.glowRing) {
            this.glowRing.geometry.dispose();
            this.glowRing.geometry = new THREE.RingGeometry(innerR - 0.01, totalOuter + 0.01, 128);
            this.glowRing.position.z = 0;
        }

        // ── Render seam presence ring ──────────────────
        this._renderRing(this.seamRingMesh, mode, histograms, combined, numSlices, zPlanes,
            innerR, seamOuter, 'presence', 1.0);

        // ── Render SSW contribution ring ──────────────
        this._renderRing(this.contribRingMesh, mode, contribHistograms, combinedContrib, numSlices, zPlanes,
            contribInner, contribOuter, 'contribution', maxContribution);

        // Arrow — positioned outside the expanded dashboard
        if (asymmetryIndex > 0.01) {
            this.arrowMesh.visible = true;
            const arrowR = totalOuter + 0.22;
            this.arrowMesh.position.set(Math.cos(arrowAngle) * arrowR, Math.sin(arrowAngle) * arrowR, 0.002);
            const sc = DASHBOARD_INFO_WIDTH * 25;
            this.arrowMesh.scale.set(sc, sc, 1);
            this.arrowMesh.rotation.z = arrowAngle;
            this.arrowMesh.material.opacity = Math.min(0.9, 0.3 + asymmetryIndex * 2);
        } else {
            this.arrowMesh.visible = false;
        }
    }

    /**
     * Render a ring mesh (seam presence or SSW contribution).
     */
    _renderRing(mesh, mode, perSliceData, combinedData, numSlices, zPlanes,
        rInner, rOuter, dataType, maxVal) {

        const posArr = mesh.geometry.getAttribute('position').array;
        const colArr = mesh.geometry.getAttribute('aColor').array;
        let vertIdx = 0;

        if (mode === 'combined') {
            // Single ring at z=0
            const zFront = RING_THICKNESS / 2;
            const zBack = -RING_THICKNESS / 2;
            vertIdx = this._renderSlice(posArr, colArr, vertIdx, combinedData,
                rInner, rOuter, zFront, zBack, dataType, maxVal);
        } else {
            // Slice mode: 50 individual rings at respective z-positions
            const halfT = RING_THICKNESS / 2;
            for (let s = 0; s < numSlices; s++) {
                const zCenter = zPlanes[s];
                const zFront = zCenter + halfT;
                const zBack = zCenter - halfT;
                vertIdx = this._renderSlice(posArr, colArr, vertIdx, perSliceData[s],
                    rInner, rOuter, zFront, zBack, dataType, maxVal);
            }
        }

        mesh.geometry.getAttribute('position').needsUpdate = true;
        mesh.geometry.getAttribute('aColor').needsUpdate = true;
        mesh.geometry.setDrawRange(0, vertIdx);
    }

    /**
     * Render one ring slice (one z-level of bins).
     */
    _renderSlice(posArr, colArr, vertIdx, hist, rInner, rOuter, zFront, zBack, dataType, maxVal) {
        for (let i = 0; i < SSW_BINS; i++) {
            const a0 = (i / SSW_BINS) * Math.PI * 2;
            const a1 = a0 + (Math.PI * 2) / SSW_BINS;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);

            const ilf = [c0 * rInner, s0 * rInner, zFront];
            const olf = [c0 * rOuter, s0 * rOuter, zFront];
            const orf = [c1 * rOuter, s1 * rOuter, zFront];
            const irf = [c1 * rInner, s1 * rInner, zFront];
            const ilb = [c0 * rInner, s0 * rInner, zBack];
            const olb = [c0 * rOuter, s0 * rOuter, zBack];
            const orb = [c1 * rOuter, s1 * rOuter, zBack];
            const irb = [c1 * rInner, s1 * rInner, zBack];

            let val = hist[i];
            let normalizedVal;
            if (dataType === 'presence') {
                // Presence is already [0,1]
                normalizedVal = val;
            } else {
                // Contribution: normalize by maxVal
                normalizedVal = maxVal > 0 ? Math.min(val / maxVal, 1.0) : 0;
            }

            const hc = normalizedVal > 0.001 ? heatColor(normalizedVal) : null;
            const r = hc ? hc.r : 0, g = hc ? hc.g : 0, b = hc ? hc.b : 0;
            const a = hc ? 1.0 : 0;

            // Front face
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, olf, orf, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, orf, irf, r, g, b, a);
            // Back face
            vertIdx = setTri(posArr, colArr, vertIdx, ilb, orb, olb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilb, irb, orb, r, g, b, a);
            // Outer wall
            vertIdx = setTri(posArr, colArr, vertIdx, olf, olb, orb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, olf, orb, orf, r, g, b, a);
            // Inner wall
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, irb, ilb, r, g, b, a);
            vertIdx = setTri(posArr, colArr, vertIdx, ilf, irf, irb, r, g, b, a);
        }
        return vertIdx;
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
