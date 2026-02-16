import { computeSSW } from './ssw.js';

self.onmessage = function (e) {
    const {
        seamPoints,
        orientX, orientY, orientZ,
        spinDirection, gyroAngle,
        alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg
    } = e.data;

    const result = computeSSW(
        seamPoints,
        orientX, orientY, orientZ,
        spinDirection, gyroAngle,
        alphaFrontDeg, inducedZoneDeg, inducedStartDeg, naturalZoneDeg, alphaBackDeg
    );

    self.postMessage(result);
};
