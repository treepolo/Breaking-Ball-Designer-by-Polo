const T = {
    'zh-TW': {
        title: '棒球旋轉 SSW 分析器',
        viewControl: '視角控制',
        pitcherView: '投手視角',
        catcherView: '捕手視角',
        ballOrientation: '球體方向',
        orientX: '方向 X', orientY: '方向 Y', orientZ: '方向 Z',
        spinAxis: '旋轉軸',
        spinDirection: '旋轉方向',
        gyroAngle: '陀螺角度',
        spinEfficiency: '旋轉效率',
        spinRate: '轉速',
        sswPlane: 'SSW 判定平面',
        directSepStart: '直接分離起點',
        inducedSepZone: '誘發分離區',
        inducedSepStart: '誘發分離起點',
        naturalSepZone: '自然分離區',
        inducedSepEnd: '誘發分離終點',
        displayMode: '顯示模式',
        separateMode: '切片顯示',
        combinedMode: '加總顯示',
        animation: '動畫',
        play: '▶ 播放',
        pause: '⏸ 暫停',
        dragAxis: '拖曳軸',
        sswResults: 'SSW 結果',
        asymmetryIndex: '不對稱指數',
        sswEffectIndex: 'SSW效果指數',
        sswContribution: 'SSW貢獻指數',
        forceDirection: '力的方向',
        langSwitch: '切換成 English',
        seamPresence: '縫線出現時長',
        topView: '俯視圖',
        noAsymmetry: '—',
        rpm: 'RPM',
    },
    en: {
        title: 'Baseball Spin SSW Analyzer',
        viewControl: 'View Control',
        pitcherView: 'Pitcher View',
        catcherView: 'Catcher View',
        ballOrientation: 'Ball Orientation',
        orientX: 'Orientation X', orientY: 'Orientation Y', orientZ: 'Orientation Z',
        spinAxis: 'Spin Axis',
        spinDirection: 'Spin Direction',
        gyroAngle: 'Gyro Angle',
        spinEfficiency: 'Spin Efficiency',
        spinRate: 'Spin Rate',
        sswPlane: 'SSW Plane',
        directSepStart: 'Direct Sep. Start',
        inducedSepZone: 'Induced Sep. Zone',
        inducedSepStart: 'Induced Sep. Start',
        naturalSepZone: 'Natural Sep. Zone',
        inducedSepEnd: 'Induced Sep. End',
        displayMode: 'Display Mode',
        separateMode: 'Slice',
        combinedMode: 'Combined',
        animation: 'Animation',
        play: '▶ Play',
        pause: '⏸ Pause',
        dragAxis: 'Drag Axis',
        sswResults: 'SSW Results',
        asymmetryIndex: 'Asymmetry Index',
        sswEffectIndex: 'SSW Effect Index',
        sswContribution: 'SSW Contribution',
        forceDirection: 'Force Direction',
        langSwitch: '切換成正體中文',
        seamPresence: 'Seam Presence',
        topView: 'Top View',
        noAsymmetry: '—',
        rpm: 'RPM',
    },
};

let currentLang = 'zh-TW';

export function setLang(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (T[currentLang][key] != null) el.textContent = T[currentLang][key];
    });
}

export function t(key) {
    return T[currentLang]?.[key] ?? key;
}

export function getLang() { return currentLang; }
export function toggleLang() {
    setLang(currentLang === 'zh-TW' ? 'en' : 'zh-TW');
    return currentLang;
}
