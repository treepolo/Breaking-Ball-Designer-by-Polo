import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { R, SEAM_TUBE_RADIUS } from './constants.js';

/**
 * Scene setup: renderer, cameras, lights, controls, background objects.
 */
export function createScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false; // we clear manually for dual viewport
    renderer.setClearColor(0xd0d8e4); // Match scene background
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0d8e4);

    // ── Main camera (pitcher view default) ─────────────
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);

    // ── Top-down camera (orthographic) ─────────────────
    // Reduced topSize to zoom in (User wants ball bigger)
    const topSize = 1.3;
    const topCamera = new THREE.OrthographicCamera(-topSize, topSize, topSize, -topSize, 0.1, 100);
    topCamera.position.set(0, 8, 0);
    topCamera.up.set(0, 0, -1); // -Z = up on screen (movement direction = up)
    topCamera.lookAt(0, 0, 0);

    // ── OrbitControls ──────────────────────────────────
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // ── Lighting ───────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xbbc8e0, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 4, 5);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
    fill.position.set(-2, -1, 3);
    scene.add(fill);

    // ── Reference objects ──────────────────────────────
    addReferenceObjects(scene);

    // ── SSW plane boundary indicators (5 planes) ───────
    // Order front→back: 直接分離起點(淺綠), 誘發分離區(淺藍), 誘發分離起點(墨綠), 自然分離區(紅), 誘發分離終點(淺藍)
    const sswDirectSepStartLine = makeIndicatorLine(0x86efac);   // 淺綠
    const sswInducedZoneLine = makeIndicatorLine(0x93c5fd);   // 淺藍
    const sswInducedStartLine = makeIndicatorLine(0x065f46);   // 墨綠
    const sswNaturalZoneLine = makeIndicatorLine(0xef4444);   // 紅色
    const sswInducedEndLine = makeIndicatorLine(0x93c5fd);   // 淺藍

    scene.add(sswDirectSepStartLine);
    scene.add(sswInducedZoneLine);
    scene.add(sswInducedStartLine);
    scene.add(sswNaturalZoneLine);
    scene.add(sswInducedEndLine);

    // ── Resize ─────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return {
        scene, camera, topCamera, renderer, controls,
        sswDirectSepStartLine, sswInducedZoneLine, sswInducedStartLine,
        sswNaturalZoneLine, sswInducedEndLine,
    };
}

function addReferenceObjects(scene) {
    // Equator ring
    const ringGeo = new THREE.RingGeometry(R * 1.6, R * 1.62, 128);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    scene.add(ring);

    // Movement direction arrow (pointing -Z) — 3x size
    const arrowLen = 2.4;
    const arrowGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -R * 1.7, 0),
        new THREE.Vector3(0, -R * 1.7, -arrowLen),
    ]);
    const arrowMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Line(arrowGeo, arrowMat));

    // Arrow head — 3x
    const headGeo = new THREE.ConeGeometry(0.12, 0.36, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, -R * 1.7, -arrowLen - 0.18);
    head.rotation.x = -Math.PI / 2;
    scene.add(head);

    // Compass dots at cardinal positions on the equator ring
    const dotGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const positions = [
        { pos: [R * 1.61, 0, 0], color: 0xef4444 },   // +X = right
        { pos: [-R * 1.61, 0, 0], color: 0x3b82f6 },  // -X = left
        { pos: [0, R * 1.61, 0], color: 0x22c55e },    // +Y = up
        { pos: [0, -R * 1.61, 0], color: 0xf59e0b },   // -Y = down
    ];
    positions.forEach(({ pos, color }) => {
        const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
        dot.position.set(...pos);
        scene.add(dot);
    });
}

/** Create a 3D ring indicator (TorusGeometry) for SSW boundaries — visible from any angle. */
function makeIndicatorLine(color) {
    const tubeR = SEAM_TUBE_RADIUS / 4;
    const geo = new THREE.TorusGeometry(R * 1.1, tubeR, 8, 64);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
    return new THREE.Mesh(geo, mat);
}

/** Set camera to pitcher view (behind ball, looking +Z → -Z). */
export function setPitcherView(camera, controls) {
    camera.position.set(0, 0, 4);
    controls.target.set(0, 0, 0);
    controls.update();
}

/** Set camera to catcher view (in front of ball, looking -Z → +Z). */
export function setCatcherView(camera, controls) {
    camera.position.set(0, 0, -4);
    controls.target.set(0, 0, 0);
    controls.update();
}
