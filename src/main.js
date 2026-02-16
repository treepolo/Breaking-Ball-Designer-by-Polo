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
const { scene, camera, topCamera, renderer, controls, sswFrontLine, sswBackLine } = createScene(canvas);

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

// ── Control application ──────────────────────────────
function applyControls() {
    updateSpinAxis(spinAxisGroup, ui.spinDirection, ui.gyroAngle);
    updateBallOrientation(ballOrientationGroup, ui.orientX, ui.orientY, ui.orientZ, anim.animationAngle);
    // Update SSW boundary indicators
    const zF = R * Math.sin(ui.alphaFrontDeg * DEG2RAD);
    const zB = R * Math.sin(ui.alphaBackDeg * DEG2RAD);
    sswFrontLine.position.z = zF;
    sswBackLine.position.z = zB;
}

function runSSW() {
    const result = computeSSW(
        seamPointsRaw,
        ui.orientX, ui.orientY, ui.orientZ,
        ui.spinDirection, ui.gyroAngle,
        ui.alphaFrontDeg, ui.alphaBackDeg
    );
    dashboard.update(
        ui.displayMode,
        result.histograms, result.combined, result.numSlices, result.zPlanes,
        result.asymmetryIndex, result.arrowAngle, result.arrowWidth
    );
    ui.setAsymmetry(result.asymmetryIndex);
    ui.setClockDirection(result.asymmetryIndex > 0.005 ? angleToClockString(result.arrowAngle) : '—');
}

// ── Render loop (dual viewport) ──────────────────────
const PANEL_W = 310;
const MINI_SIZE = 180;
const MINI_PAD = 14;

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
    const pr = renderer.getPixelRatio();

    renderer.clear();
    renderer.setScissorTest(true);

    // ── Main viewport ──────────────────────────────────
    const mainW = w - PANEL_W;
    renderer.setViewport(0, 0, mainW, h);
    renderer.setScissor(0, 0, mainW, h);
    camera.aspect = mainW / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // ── Mini top-down viewport ─────────────────────────
    const mx = MINI_PAD;
    const my = h - MINI_SIZE - MINI_PAD; // WebGL y is bottom-up
    renderer.setViewport(mx, my, MINI_SIZE, MINI_SIZE);
    renderer.setScissor(mx, my, MINI_SIZE, MINI_SIZE);
    renderer.render(scene, topCamera);

    renderer.setScissorTest(false);
}

// ── Kick off ─────────────────────────────────────────
applyControls();
runSSW();
requestAnimationFrame(animate);
