import { DEG2RAD } from './constants.js';
import { angleToClockString } from './ssw.js';
import { toggleLang, setLang, t } from './i18n.js';

export class UIControls {
    constructor(onChange) {
        this.onChange = onChange;
        this.isPlaying = false;
        this._bindSliders();
        this._bindPlayPause();
        this._bindDragAxis();
        this._bindDisplayMode();
        this._bindLang();
        this._bindViewButtons();
        setLang('zh-TW'); // initialize
    }

    get orientX() { return parseFloat(this._el('orient-x').value) * DEG2RAD; }
    get orientY() { return parseFloat(this._el('orient-y').value) * DEG2RAD; }
    get orientZ() { return parseFloat(this._el('orient-z').value) * DEG2RAD; }
    get spinDirection() { return parseFloat(this._el('spin-direction').value) * DEG2RAD; }
    get gyroAngle() { return parseFloat(this._el('gyro-angle').value) * DEG2RAD; }
    get spinRate() { return parseFloat(this._el('spin-rate').value); }
    get alphaFrontDeg() { return parseFloat(this._el('ssw-alpha-front').value); }
    get inducedZoneDeg() { return parseFloat(this._el('ssw-induced-zone').value); }
    get inducedStartDeg() { return parseFloat(this._el('ssw-induced-start').value); }
    get naturalZoneDeg() { return parseFloat(this._el('ssw-natural-zone').value); }
    get alphaBackDeg() { return parseFloat(this._el('ssw-alpha-back').value); }
    get displayMode() {
        const checked = document.querySelector('input[name="display-mode"]:checked');
        return checked ? checked.value : 'combined';
    }
    get dragAxis() {
        const checked = document.querySelector('input[name="drag-axis"]:checked');
        return checked ? checked.value : 'x';
    }

    setOrientX(deg) { this._el('orient-x').value = deg; this._el('val-orient-x').textContent = `${Math.round(deg)}°`; }
    setOrientY(deg) { this._el('orient-y').value = deg; this._el('val-orient-y').textContent = `${Math.round(deg)}°`; }
    setOrientZ(deg) { this._el('orient-z').value = deg; this._el('val-orient-z').textContent = `${Math.round(deg)}°`; }
    setAsymmetry(val) { this._el('result-asymmetry').textContent = val.toFixed(2); }
    setSSWEffectIndex(val) { this._el('result-ssw-effect').textContent = val.toFixed(2); }
    setClockDirection(str) { this._el('result-clock').textContent = str; }

    _el(id) { return document.getElementById(id); }

    _bindSliders() {
        // 5 SSW plane sliders ordered front→back (increasing z-value):
        // alphaFront(直接分離起點) ≤ inducedZone(誘發分離區) ≤ inducedStart(誘發分離起點) ≤ naturalZone(自然分離區) ≤ alphaBack(誘發分離終點)
        // Same convention as original: front has the smaller value, back has the larger value.

        const sliders = [
            { id: 'orient-x', label: 'val-orient-x', fmt: v => `${v}°`, key: 'orientX' },
            { id: 'orient-y', label: 'val-orient-y', fmt: v => `${v}°`, key: 'orientY' },
            { id: 'orient-z', label: 'val-orient-z', fmt: v => `${v}°`, key: 'orientZ' },
            { id: 'spin-direction', label: 'val-spin-dir', fmt: v => angleToClockString(parseFloat(v) * DEG2RAD), key: 'spinDirection' },
            { id: 'gyro-angle', label: 'val-gyro', fmt: v => `${v}°`, key: 'gyroAngle' },
            { id: 'spin-rate', label: 'val-rpm', fmt: v => `${v} ${t('rpm')}`, key: 'spinRate' },
            { id: 'ssw-alpha-front', label: 'val-alpha-front', fmt: v => `${v}°`, key: 'alphaFront' },
            { id: 'ssw-induced-zone', label: 'val-induced-zone', fmt: v => `${v}°`, key: 'inducedZone' },
            { id: 'ssw-induced-start', label: 'val-induced-start', fmt: v => `${v}°`, key: 'inducedStart' },
            { id: 'ssw-natural-zone', label: 'val-natural-zone', fmt: v => `${v}°`, key: 'naturalZone' },
            { id: 'ssw-alpha-back', label: 'val-alpha-back', fmt: v => `${v}°`, key: 'alphaBack' },
        ];

        // Helper: get ordered plane slider elements
        const planeIds = ['ssw-alpha-front', 'ssw-induced-zone', 'ssw-induced-start', 'ssw-natural-zone', 'ssw-alpha-back'];

        for (const s of sliders) {
            const el = this._el(s.id);
            const lbl = this._el(s.label);
            el.addEventListener('input', () => {
                // Enforce ordering for the 5 SSW planes
                const planeIdx = planeIds.indexOf(s.id);
                if (planeIdx >= 0) {
                    const val = parseFloat(el.value);
                    // Clamp: cannot go below the plane in front (lower index = smaller value)
                    if (planeIdx > 0) {
                        const frontVal = parseFloat(this._el(planeIds[planeIdx - 1]).value);
                        if (val < frontVal) el.value = frontVal;
                    }
                    // Clamp: cannot exceed the plane behind (higher index = larger value)
                    if (planeIdx < planeIds.length - 1) {
                        const backVal = parseFloat(this._el(planeIds[planeIdx + 1]).value);
                        if (val > backVal) el.value = backVal;
                    }
                }
                lbl.textContent = s.fmt(el.value);
                this.onChange({ key: s.key, value: parseFloat(el.value) });
            });
        }
    }

    _bindPlayPause() {
        const btn = this._el('btn-play-pause');
        btn.addEventListener('click', () => {
            this.isPlaying = !this.isPlaying;
            btn.textContent = this.isPlaying ? t('pause') : t('play');
            btn.classList.toggle('playing', this.isPlaying);
            this.onChange({ key: 'playPause', value: this.isPlaying });
        });
    }

    _bindDragAxis() {
        document.querySelectorAll('input[name="drag-axis"]').forEach(r => {
            r.addEventListener('change', () => this.onChange({ key: 'dragAxis', value: r.value }));
        });
    }

    _bindDisplayMode() {
        document.querySelectorAll('input[name="display-mode"]').forEach(r => {
            r.addEventListener('change', () => this.onChange({ key: 'displayMode', value: r.value }));
        });
    }

    _bindLang() {
        this._el('btn-lang').addEventListener('click', () => {
            const newLang = toggleLang();
            this._el('btn-lang').textContent = t('langSwitch');
            // Re-format dynamic labels
            this._el('val-spin-dir').textContent = angleToClockString(this.spinDirection);
            const btn = this._el('btn-play-pause');
            btn.textContent = this.isPlaying ? t('pause') : t('play');
        });
    }

    _bindViewButtons() {
        this._el('btn-pitcher').addEventListener('click', () => this.onChange({ key: 'pitcherView' }));
        this._el('btn-catcher').addEventListener('click', () => this.onChange({ key: 'catcherView' }));
    }
}
