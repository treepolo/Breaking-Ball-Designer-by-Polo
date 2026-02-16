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
    setClockDirection(str) { this._el('result-clock').textContent = str; }

    _el(id) { return document.getElementById(id); }

    _bindSliders() {
        const sliders = [
            { id: 'orient-x', label: 'val-orient-x', fmt: v => `${v}°`, key: 'orientX' },
            { id: 'orient-y', label: 'val-orient-y', fmt: v => `${v}°`, key: 'orientY' },
            { id: 'orient-z', label: 'val-orient-z', fmt: v => `${v}°`, key: 'orientZ' },
            { id: 'spin-direction', label: 'val-spin-dir', fmt: v => angleToClockString(parseFloat(v) * DEG2RAD), key: 'spinDirection' },
            { id: 'gyro-angle', label: 'val-gyro', fmt: v => `${v}°`, key: 'gyroAngle' },
            { id: 'spin-rate', label: 'val-rpm', fmt: v => `${v} ${t('rpm')}`, key: 'spinRate' },
            { id: 'ssw-alpha-front', label: 'val-alpha-front', fmt: v => `${v}°`, key: 'alphaFront' },
            { id: 'ssw-alpha-back', label: 'val-alpha-back', fmt: v => `${v}°`, key: 'alphaBack' },
        ];
        for (const s of sliders) {
            const el = this._el(s.id);
            const lbl = this._el(s.label);
            el.addEventListener('input', () => {
                // Clamp front ≤ back
                if (s.key === 'alphaFront') {
                    const back = parseFloat(this._el('ssw-alpha-back').value);
                    if (parseFloat(el.value) > back) el.value = back;
                } else if (s.key === 'alphaBack') {
                    const front = parseFloat(this._el('ssw-alpha-front').value);
                    if (parseFloat(el.value) < front) el.value = front;
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
