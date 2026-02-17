import { computeSSW } from './ssw.js';

self.onmessage = function (e) {
    const {
        mode, // 'single' or 'curve'
        seamPoints,
        orientX, orientY, orientZ,
        spinDirection, gyroAngle,
        alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg
    } = e.data;

    if (mode === 'curve') {
        // Calculate curve for Gyro Angle -90 to 90
        const curveData = [];
        // Use 5 degree steps for performance.
        const step = 5;
        for (let g = -90; g <= 90; g += step) {
            const rad = g * (Math.PI / 180);
            const res = computeSSW(
                seamPoints,
                orientX, orientY, orientZ,
                spinDirection, rad,
                alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg,
                true // fast mode
            );

            // Disable manual scaling -- compueSSW already normalizes by step count
            // Adjust scale because ssw.js divides by 720 but we only did 36 steps
            // Ratio = 720 / 36 = 20
            // const scale = 720 / 36;
            // res.sswEffectIndex *= scale;
            // res.effectSumA *= scale;
            // res.effectSumB *= scale;

            curveData.push({
                gyro: g,
                sswEffectIndex: res.sswEffectIndex,
                effectSumA: res.effectSumA,
                effectSumB: res.effectSumB
            });
        }
        self.postMessage({ mode: 'curve', data: curveData });
    } else {
        // Single calculation
        const result = computeSSW(
            seamPoints,
            orientX, orientY, orientZ,
            spinDirection, gyroAngle,
            alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg
        );
        self.postMessage(result); // Implicitly result has no 'mode', handled as single
    }
};

self.postMessage({ type: 'ready' });
