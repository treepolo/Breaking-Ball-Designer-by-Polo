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
        spinRate: '轉速',
        sswPlane: 'SSW 判定平面',
        frontBound: '前邊界 α',
        backBound: '後邊界 α',
        displayMode: '顯示模式',
        separateMode: '分別顯示',
        combinedMode: '加總顯示',
        animation: '動畫',
        play: '▶ 播放',
        pause: '⏸ 暫停',
        dragAxis: '拖曳軸',
        sswResults: 'SSW 結果',
        asymmetryIndex: '不對稱指數',
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
        spinRate: 'Spin Rate',
        sswPlane: 'SSW Plane',
        frontBound: 'Front Bound α',
        backBound: 'Back Bound α',
        displayMode: 'Display Mode',
        separateMode: 'Separate',
        combinedMode: 'Combined',
        animation: 'Animation',
        play: '▶ Play',
        pause: '⏸ Pause',
        dragAxis: 'Drag Axis',
        sswResults: 'SSW Results',
        asymmetryIndex: 'Asymmetry Index',
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
