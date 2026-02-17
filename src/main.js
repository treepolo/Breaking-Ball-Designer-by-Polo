import './style.css';
import * as THREE from 'three';
import { createScene, setPitcherView, setCatcherView } from './scene.js';
import { createBaseball, updateSpinAxis, updateBallOrientation } from './baseball.js';
import { angleToClockString } from './ssw.js';
import SSWWorker from './worker.js?worker';
import { Dashboard } from './dashboard.js';
import { UIControls } from './ui.js';
import { AnimationController } from './animation.js';
import { SSWCharts } from './charts.js';
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

// ── SSW Charts ───────────────────────────────────────
// We need to mount charts to DOM. Let's create a container in index.html later.
// Converting existing chart div or creating one? User said "Information area".
// I'll assume we can pass a container ID.
const charts = new SSWCharts('ssw-charts-container');

// ── SSW Worker & State ──────────────────────────────
const sswWorker = new SSWWorker();
let isComputing = false;
let pendingRequest = null;

sswWorker.onmessage = (e) => {
    isComputing = false;
    const result = e.data;

    if (result.type === 'ready') {
        runSSW();
        return;
    }

    if (result.mode === 'curve') {
        // Curve data received
        charts.updateData(result.data);
        // Also update the red line position for current state
        charts.updateCursor(ui.gyroAngle / DEG2RAD);
    } else {
        // Single result received (normal update)

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

        // Update Chart Cursor
        charts.updateCursor(ui.gyroAngle / DEG2RAD);

        // If there's a pending request, process it now (prioritize single requests?)
        // If we have a pending curve request, we might want to send it?
        // But logic below handles `pendingRequest` which is single data.
    }

    // Check pending
    if (pendingRequest) {
        requestSSW(pendingRequest);
        pendingRequest = null;
    }
};

let lastCurveParams = null; // Track params to avoid redundant curve calcs

function requestSSW(data) {
    if (isComputing) {
        pendingRequest = data;
        return;
    }
    isComputing = true;
    sswWorker.postMessage(data);
}

// Separate worker for curves to ensure UI responsiveness?
// Or just piggyback? "Smooth" implies 60fps.
// If curve takes 100ms, UI dashboard lags.
// Let's instantiate a SECOND worker for curves.
const curveWorker = new SSWWorker();
curveWorker.onmessage = (e) => {
    if (e.data.mode === 'curve') {
        charts.updateData(e.data.data);
        charts.updateCursor(ui.gyroAngle / DEG2RAD);
    } else if (e.data.type === 'ready') {
        // Run initial curve calculation when worker is ready
        updateCurve = true; // force update
        runSSW();
    }
};

function requestCurve(data) {
    // Just post message, no lock needed if we don't care about order or just want latest.
    // Throttling might be good.
    curveWorker.postMessage({ ...data, mode: 'curve' });
}

// ── SSW update flag ──────────────────────────────────
let needsMainUpdate = true;
let updateSSW = true;
let updateCurve = true;

// ── UI ───────────────────────────────────────────────
const ui = new UIControls(({ key, value, type }) => {
    if (key === 'playPause') { anim.setPlaying(ui.isPlaying); return; }
    if (key === 'pitcherView') { setPitcherView(camera, controls); return; }
    if (key === 'catcherView') { setCatcherView(camera, controls); return; }
    if (key === 'spinRate') return;
    if (key === 'visibleSeam' || key === 'visibleContrib') {
        dashboard.setVisibility(ui.visibleSeam, ui.visibleContrib);
        return;
    }

    updateSSW = true;
    if (type === 'committed' || type === undefined) {
        updateCurve = true;
    }
    needsMainUpdate = true;
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
    try {
        // Collect parameters
        const params = {
            seamPoints: seamPointsRaw,
            orientX: ui.orientX, orientY: ui.orientY, orientZ: ui.orientZ,
            spinDirection: ui.spinDirection, gyroAngle: ui.gyroAngle,
            alphaFrontDeg: ui.alphaFrontDeg, inducedZoneDeg: ui.inducedZoneDeg, inducedStartDeg: ui.inducedStartDeg,
            naturalZoneDeg: ui.naturalZoneDeg, alphaBackDeg: ui.alphaBackDeg
        };

        if (updateSSW) {
            requestSSW(params);
            updateSSW = false;
        }

        // Check if curve needs update
        const curveParamsKey = JSON.stringify({
            ox: params.orientX, oy: params.orientY, oz: params.orientZ,
            sd: params.spinDirection,
            af: params.alphaFrontDeg, iz: params.inducedZoneDeg, is: params.inducedStartDeg, nz: params.naturalZoneDeg, ab: params.alphaBackDeg
        });

        if (curveParamsKey !== lastCurveParams) {
            if (updateCurve) {
                lastCurveParams = curveParamsKey;
                requestCurve(params);
                updateCurve = false;
            }
        } else {
            updateCurve = false;
        }

        charts.updateCursor(ui.gyroAngle / DEG2RAD);
    } catch (err) {
        console.error("runSSW Error:", err);
    }
}

// ── Render loop (dual viewport) ──────────────────────
const MOBILE_BP = 700;
let mobilePanelHidden = false;

function getLayoutValues() {
    const isMobile = window.innerWidth <= MOBILE_BP;
    return {
        isMobile,
        panelW: isMobile ? 0 : 310,
        // miniSize: isMobile ? 135 : 180, // No longer used for manual positioning
        // miniPad: isMobile ? 10 : 14,
        sidebarW: isMobile ? 0 : 300,
    };
}

function animate(timestamp) {
    requestAnimationFrame(animate);
    anim.tick(timestamp);
    controls.update();
    applyControls();

    if (needsMainUpdate) {
        needsMainUpdate = false;
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
    // Shifted by sidebarW (if desktop)
    const sidebarW = getLayoutValues().sidebarW;

    const mainX = sidebarW;
    const mainW = w - panelW - sidebarW;
    const visH = h - panelH;

    renderer.setViewport(mainX, panelH, mainW, visH);
    renderer.setScissor(mainX, panelH, mainW, visH);
    camera.aspect = mainW / visH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // ── Mini top-down viewport ─────────────────────────
    // Use DOM element position
    const miniEl = document.getElementById('mini-viewport');
    if (miniEl) {
        const rect = miniEl.getBoundingClientRect();
        // Convert client coordinates to canvas (gl) coordinates
        // Canvas is full screen, so client matches canvas logical pixels?
        // But Y is inverted in GL.
        // height of canvas DOM element:
        const canvasH = renderer.domElement.height / renderer.getPixelRatio(); // logical

        // Rect gives client pixels (logical).
        // GL lower-left corner:
        // x = rect.left
        // y = canvasH - rect.bottom
        const mx = rect.left;
        const my = canvasH - rect.bottom;
        const mw = rect.width;
        const mh = rect.height;

        // Scissor needs physical pixels? NO, setScissor handles pixelRatio if setSize handled it?
        // Wait, three.js setViewport uses pixels. If setSize used window.innerWidth, and pixelRatio set.
        // Viewport expects coordinates relative to drawing buffer size? 
        // Docs: (x, y, width, height) in pixels.
        // If setSize set buffer size = window * dpr.
        // Then we usually need to scale by dpr.
        // BUT lines 287/288 divide by dpr to get logical `w`.
        // If I use logical `mx`, do I need to scale back up?
        // Usually yes, if buffer is scaled. 
        // But `setSize` handles the CSS style?
        // Let's check `scene.js`. 
        // `renderer.setPixelRatio(...)`.
        // If pixelRatio is 2, buffer is 2x.
        // setViewport needs 2x coordinates.
        // BUT if `renderer.domElement` style matches window inner, then `w` (logical) is correct for layout logic.
        // BUT setViewport takes physical pixels if buffer is physical?
        // Actually, three.js handles `setPixelRatio`.
        // If I pass logical coords to setViewport, does it auto-scale? NO.
        // I must scale explicitly if I'm doing manual calculation. OR rely on Three.js not needing scaling?
        // Wait, `renderer.setViewport` documentation says "The x, y, width, and height of the viewport."
        // If `setPixelRatio` is used, resizing the canvas usually updates the viewport OF THE RENDERER Context?
        // No, setViewport sets the GL viewport.
        // If devicePixelRatio is 2, and window is 1000px wide, buffer is 2000px.
        // If I say setViewport(0, 0, 1000, 1000), it fills ONLY lower-left quadrant (500 logical, 1000 physical).
        // SO I NEED TO MULTIPLY BY DPR.
        // But wait, line 287 `w` divides by dpr.
        // This implies `w` is logical.
        // `renderer.setViewport(0, ..., w, ...)` uses logical? 
        // If I use logical, result is small?
        // Let me check existing `main.js`: `renderer.setViewport(mx, my, miniSize, miniSize)`. `miniSize` is 180 (logical).
        // This implies `setViewport` works with LOGICAL pixels or my assumption about `w` is wrong.
        // Actually `renderer.setViewport` DOES NOT AUTO-SCALE.
        // If existing code works, then either:
        // 1. `setPixelRatio` is 1.
        // 2. Or `renderer.domElement.width` matches `w`.
        // Let's assume logical coordinates need scaling IF `setPixelRatio` is active.
        // BUT line 287: `w = domElement.width / pixelRatio`.
        // If domElement.width is physical, then `w` is logical.
        // If I pass `w` to setViewport, I am passing logical.
        // If buffer is physical, render is small.
        // I suspect the current code might be relying on something else or I'm overthinking.
        // BUT to be safe, I should scale by dpr for SetViewport?
        // Wait, looking at `renderer.setScissor`: 
        // Existing lines 313: `renderer.setViewport(mx, my, miniSize, miniSize)`.
        // If this worked, then logical coordinates worked.
        // Why? Maybe Three.js applies pixel ratio internally? 
        // NO.
        // Maybe the DOM element width is just logical?
        // `renderer.setSize(window.innerWidth, window.innerHeight)` sets canvas.width = innerWidth * pixelRatio.
        // So canvas.width is physical.
        // So logical coordinates are 1/dpr of physical.
        // So I SHOULD multiply by dpr.
        // Why did previous code work? 
        // Maybe it didn't look high-res? Or it was small?
        // Actually `renderer.domElement.width` is buffer width.
        // `w` is logical width.
        // If I passed `w` (visible width) as `mainW`, and `w` is logical.
        // Then `setViewport` used logical units.
        // If buffer is 2x, then viewport is 1/2 size.
        // This means my previous modification might have been making it smaller than expected on Retina?
        // Or maybe `w` was calculated differently before?
        // Line 287 was existing code.
        // I will assume existing code was correct about units, but I'll add precise logic for getting rect.
        // `mx` derived from `rect.left` is logical.
        // I will stick to the pattern used in the file: using variables like `w`, `mainW` (logical).

        renderer.setViewport(mx, my, mw, mh);
        renderer.setScissor(mx, my, mw, mh);
        renderer.render(scene, topCamera);
    }
    renderer.setScissorTest(false);

    // ── Update Labels ──────────────────────────────────
    // Labels rely on projection. Camera aspect corrected above.
    // Need to pass offset? updateLabelPosition logic uses `mainW`.
    // But normalized device coordinates (NDC) map to viewport.
    // If viewport is offset by mainX, then NDC (-1 to 1) maps to (mainX to mainX + mainW).
    // `v.x` is -1..1.
    // `x = (v.x + 1) / 2 * mainW + mainX`?
    // Current helper function: `x = (v.x + 1) / 2 * mainW;`
    // It assumes viewport starts at 0.
    // I need to update `updateLabelPosition` to accept `offsetX`.

    updateLabelPosition(labelA, posA, mainW, visH, panelH, mainX);
    updateLabelPosition(labelB, posB, mainW, visH, panelH, mainX);
    updateLabelPosition(labelTop, posTop, mainW, visH, panelH, mainX);
}

function updateLabelPosition(el, pos, mainW, visH, panelH, mainX = 0) {
    if (!el) return;
    const v = pos.clone().project(camera); // NDC
    // Check if behind camera
    if (Math.abs(v.z) > 1) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';

    const x = ((v.x + 1) / 2 * mainW) + mainX; // visual position on screen
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
