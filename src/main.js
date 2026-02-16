import './style.css';
import { createScene, setPitcherView, setCatcherView } from './scene.js';
import { createBaseball, updateSpinAxis, updateBallOrientation } from './baseball.js';
import { computeSSW, angleToClockString } from './ssw.js';
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

// ── SSW update flag ──────────────────────────────────
let needsSSWUpdate = true;

// ── UI ───────────────────────────────────────────────
const ui = new UIControls(({ key }) => {
    if (key === 'playPause') { anim.setPlaying(ui.isPlaying); return; }
    if (key === 'pitcherView') { setPitcherView(camera, controls); return; }
    if (key === 'catcherView') { setCatcherView(camera, controls); return; }
    if (key === 'spinRate') return;
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
    const result = computeSSW(
        seamPointsRaw,
        ui.orientX, ui.orientY, ui.orientZ,
        ui.spinDirection, ui.gyroAngle,
        ui.alphaFrontDeg, ui.inducedZoneDeg, ui.inducedStartDeg,
        ui.naturalZoneDeg, ui.alphaBackDeg
    );

    const mode = ui.displayMode === 'slice' ? 'slice' : 'combined';

    dashboard.update(
        mode,
        result.histograms, result.combined,
        result.contribHistograms, result.combinedContrib,
        result.numSlices, result.zPlanes,
        result.asymmetryIndex, result.arrowAngle, result.arrowWidth,
        result.maxContribution
    );
    ui.setAsymmetry(result.asymmetryIndex);
    ui.setSSWEffectIndex(result.sswEffectIndex);
    ui.setClockDirection(result.asymmetryIndex > 0.005 ? angleToClockString(result.arrowAngle) : '—');
    updateContribLegend(result.maxContribution);
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
