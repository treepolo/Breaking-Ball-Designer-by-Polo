import './style.css';
import * as THREE from 'three';
import { createScene, setPitcherView, setCatcherView } from './scene.js';
import { createBaseball, updateSpinAxis, updateBallOrientation } from './baseball.js';
import { angleToClockString } from './ssw.js';
import SSWWorker from './worker.js?worker';
import { Dashboard } from './dashboard.js';
import { UIControls } from './ui.js';
import { AnimationController } from './animation.js';
import { R, DEG2RAD } from './constants.js';

// ── Scene ────────────────────────────────────────────
const canvas = document.getElementById('three-canvas');
const {
    scene, camera, topCamera, renderer, controls,
    sswDirectSepStartLine, sswInducedZoneLine, sswInducedStartLine,
    sswNaturalZoneLine, sswInducedEndLine,
} = createScene(canvas);

// ── Baseball ─────────────────────────────────────────
const { spinAxisGroup, ballOrientationGroup, seamPointsRaw } = createBaseball();
scene.add(spinAxisGroup);

// ── Dashboard ────────────────────────────────────────
const dashboard = new Dashboard(scene);

// ── SSW Worker & State ──────────────────────────────
const sswWorker = new SSWWorker();
let isComputing = false;
let pendingRequest = null;

sswWorker.onmessage = (e) => {
    isComputing = false;
    const result = e.data;

    // Update Dashboard & UI
    const mode = ui.displayMode === 'slice' ? 'slice' : 'combined';
    dashboard.update(
        mode,
        result.histograms, result.combined,
        result.contribHistograms, result.combinedContrib,
        result.numSlices, result.zPlanes,
        result.asymmetryIndex, result.arrowAngle, result.arrowWidth,
        result.maxContribution,
        ui.visibleSeam, ui.visibleContrib // Pass visibility flags
    );
    ui.setAsymmetry(result.asymmetryIndex);
    ui.setSSWEffectIndex(result.sswEffectIndex);
    ui.setClockDirection(result.sswEffectIndex > 0.005 ? angleToClockString(result.arrowAngle) : '—');
    updateContribLegend(result.maxContribution);
    updateSSWLabels(result.effectSumA, result.effectSumB, result.sswEffectIndex, result.arrowAngle);

    // If there's a pending request, process it now
    if (pendingRequest) {
        requestSSW(pendingRequest);
        pendingRequest = null;
    }
};

function requestSSW(data) {
    if (isComputing) {
        pendingRequest = data;
        return;
    }
    isComputing = true;
    sswWorker.postMessage(data);
}

// ── SSW update flag ──────────────────────────────────
let needsSSWUpdate = true;

// ── UI ───────────────────────────────────────────────
const ui = new UIControls(({ key }) => {
    if (key === 'playPause') { anim.setPlaying(ui.isPlaying); return; }
    if (key === 'pitcherView') { setPitcherView(camera, controls); return; }
    if (key === 'catcherView') { setCatcherView(camera, controls); return; }
    if (key === 'spinRate') return;
    if (key === 'visibleSeam' || key === 'visibleContrib') {
        dashboard.setVisibility(ui.visibleSeam, ui.visibleContrib);
        return;
    }
    needsSSWUpdate = true;
});

// ── Animation ────────────────────────────────────────
const anim = new AnimationController(canvas, ui, (angle) => {
    updateBallOrientation(ballOrientationGroup, ui.orientX, ui.orientY, ui.orientZ, angle);
});

// ── Contribution legend elements ─────────────────────
const contribMaxEl = document.getElementById('contrib-max');
const contrib75El = document.getElementById('contrib-75');
const contrib50El = document.getElementById('contrib-50');
const contrib25El = document.getElementById('contrib-25');

// ── SSW Labels ──────────────────────────────────────
const labelA = document.getElementById('label-hemisphere-a');
const labelB = document.getElementById('label-hemisphere-b');
const labelTop = document.getElementById('label-top');

const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const posTop = new THREE.Vector3(0, R * 1.55, 0); // Global top (slightly higher)

function updateSSWLabels(valA, valB, valTotal, arrowAngle) {
    labelA.textContent = valA ? valA.toFixed(2) : "0.00";
    labelB.textContent = valB ? valB.toFixed(2) : "0.00";
    labelTop.textContent = valTotal ? valTotal.toFixed(2) : "0.00";

    // Calculate positions based on judgment line
    // judgmentAngle splits the circle. Half A is "Right" relative to judgment vector?
    // In computeSSW: judgmentAngle = spinDirection + PI/2.
    // side >= 0 (A) is the half where sin(ang - judgment) >= 0.
    // Max value of sin occurs at ang - judgment = PI/2 => ang = judgment + PI/2.
    // So Center of A is at judgment + PI/2.

    // UI spinDirection includes +PI relative to raw slider?
    // computeSSW uses passed spinDirection. ui.spinDirection is the source.

    let judgmentAngle = ui.spinDirection + Math.PI / 2;
    // Ensure posA and posB are "outside" the ball magnitude R
    const rLabel = R * 1.35;

    const angA = judgmentAngle + Math.PI / 2;
    const angB = judgmentAngle - Math.PI / 2;

    posA.set(rLabel * Math.cos(angA), rLabel * Math.sin(angA), 0);
    posB.set(rLabel * Math.cos(angB), rLabel * Math.sin(angB), 0);
}

function updateContribLegend(maxVal) {
    contribMaxEl.textContent = maxVal.toFixed(2);
    contrib75El.textContent = (maxVal * 0.75).toFixed(2);
    contrib50El.textContent = (maxVal * 0.5).toFixed(2);
    contrib25El.textContent = (maxVal * 0.25).toFixed(2);
}

// ── Control application ──────────────────────────────
function applyControls() {
    updateSpinAxis(spinAxisGroup, ui.spinDirection, ui.gyroAngle);
    updateBallOrientation(ballOrientationGroup, ui.orientX, ui.orientY, ui.orientZ, anim.animationAngle);

    // Update 5 SSW boundary indicators
    sswDirectSepStartLine.position.z = R * Math.sin(ui.alphaFrontDeg * DEG2RAD);
    sswInducedZoneLine.position.z = R * Math.sin(ui.inducedZoneDeg * DEG2RAD);
    sswInducedStartLine.position.z = R * Math.sin(ui.inducedStartDeg * DEG2RAD);
    sswNaturalZoneLine.position.z = R * Math.sin(ui.naturalZoneDeg * DEG2RAD);
    sswInducedEndLine.position.z = R * Math.sin(ui.alphaBackDeg * DEG2RAD);
}

function runSSW() {
    // Collect parameters
    const params = {
        seamPoints: seamPointsRaw,
        orientX: ui.orientX, orientY: ui.orientY, orientZ: ui.orientZ,
        spinDirection: ui.spinDirection, gyroAngle: ui.gyroAngle,
        alphaFrontDeg: ui.alphaFrontDeg, inducedZoneDeg: ui.inducedZoneDeg, inducedStartDeg: ui.inducedStartDeg,
        naturalZoneDeg: ui.naturalZoneDeg, alphaBackDeg: ui.alphaBackDeg
    };

    requestSSW(params);
}

// ── Render loop (dual viewport) ──────────────────────
const MOBILE_BP = 700;
let mobilePanelHidden = false;

function getLayoutValues() {
    const isMobile = window.innerWidth <= MOBILE_BP;
    return {
        isMobile,
        panelW: isMobile ? 0 : 310,
        miniSize: isMobile ? 135 : 180,
        miniPad: isMobile ? 10 : 14,
    };
}

function animate(timestamp) {
    requestAnimationFrame(animate);
    anim.tick(timestamp);
    controls.update();
    applyControls();

    if (needsSSWUpdate) {
        needsSSWUpdate = false;
        setTimeout(runSSW, 0);
    }

    const w = renderer.domElement.width / renderer.getPixelRatio();
    const h = renderer.domElement.height / renderer.getPixelRatio();

    const { isMobile, panelW, miniSize, miniPad } = getLayoutValues();

    // On mobile with panel open, crop 3D area above the panel
    let panelH = 0;
    if (isMobile && !mobilePanelHidden) {
        panelH = Math.round(controlPanel.offsetHeight);
    }

    renderer.clear();
    renderer.setScissorTest(true);

    // ── Main viewport ──────────────────────────────────
    const mainW = w - panelW;
    const visH = h - panelH;
    renderer.setViewport(0, panelH, mainW, visH);
    renderer.setScissor(0, panelH, mainW, visH);
    camera.aspect = mainW / visH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // ── Mini top-down viewport ─────────────────────────
    const mx = miniPad;
    const my = h - miniSize - miniPad;
    renderer.setViewport(mx, my, miniSize, miniSize);
    renderer.setScissor(mx, my, miniSize, miniSize);
    renderer.render(scene, topCamera);
    renderer.setScissorTest(false);

    // ── Update Labels ──────────────────────────────────
    updateLabelPosition(labelA, posA, mainW, visH, panelH);
    updateLabelPosition(labelB, posB, mainW, visH, panelH);
    updateLabelPosition(labelTop, posTop, mainW, visH, panelH);
}

function updateLabelPosition(el, pos, mainW, visH, panelH) {
    if (!el) return;
    const v = pos.clone().project(camera); // NDC
    // Check if behind camera
    if (Math.abs(v.z) > 1) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';

    const x = (v.x + 1) / 2 * mainW;
    const y_gl = (v.y + 1) / 2 * visH + panelH;
    const y = window.innerHeight - y_gl;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
}

// ── Mobile panel toggle ─────────────────────────────
const toggleBtn = document.getElementById('btn-toggle-panel');
const controlPanel = document.getElementById('control-panel');

toggleBtn.addEventListener('click', () => {
    mobilePanelHidden = controlPanel.classList.toggle('panel-hidden');
    toggleBtn.classList.toggle('panel-open', !mobilePanelHidden);
    toggleBtn.textContent = mobilePanelHidden ? '▲' : '▼';
});

// ── Kick off ─────────────────────────────────────────
applyControls();
runSSW();
requestAnimationFrame(animate);
