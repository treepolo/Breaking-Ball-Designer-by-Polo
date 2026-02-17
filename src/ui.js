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
        this._bindVisibility();
        this._bindLang();
        this._bindViewButtons();
        this._bindHelp();
        setLang('zh-TW'); // initialize
    }

    get orientX() { return parseFloat(this._el('orient-x').value) * DEG2RAD; }
    get orientY() { return parseFloat(this._el('orient-y').value) * DEG2RAD; }
    get orientZ() { return parseFloat(this._el('orient-z').value) * DEG2RAD; }
    get spinDirection() { return parseFloat(this._el('spin-direction').value) * DEG2RAD + Math.PI; }
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
    get visibleSeam() { return this._el('check-visible-seam').checked; }
    get visibleContrib() { return this._el('check-visible-contrib').checked; }

    setOrientX(deg) { this._el('orient-x').value = deg; this._el('val-orient-x').value = Math.round(deg); }
    setOrientY(deg) { this._el('orient-y').value = deg; this._el('val-orient-y').value = Math.round(deg); }
    setOrientZ(deg) { this._el('orient-z').value = deg; this._el('val-orient-z').value = Math.round(deg); }
    setAsymmetry(val) { this._el('result-asymmetry').textContent = val.toFixed(2); }
    setSSWEffectIndex(val) { this._el('result-ssw-effect').textContent = val.toFixed(2); }
    setClockDirection(str) { this._el('result-clock').textContent = str; }

    _el(id) { return document.getElementById(id); }

    _bindSliders() {
        // 5 SSW plane sliders ordered front→back (increasing z-value):
        // alphaFront(直接分離起點) ≤ inducedZone(誘發分離區) ≤ inducedStart(誘發分離起點) ≤ naturalZone(自然分離區) ≤ alphaBack(誘發分離終點)
        // Same convention as original: front has the smaller value, back has the larger value.

        const sliders = [
            { id: 'orient-x', label: 'val-orient-x', key: 'orientX' },
            { id: 'orient-y', label: 'val-orient-y', key: 'orientY' },
            { id: 'orient-z', label: 'val-orient-z', key: 'orientZ' },
            { id: 'spin-direction', label: 'val-spin-dir', key: 'spinDirection', isClock: true },
            { id: 'spin-direction', label: 'val-spin-dir', key: 'spinDirection', isClock: true },
            { id: 'gyro-angle', label: 'val-gyro', key: 'gyroAngle' },
            { id: 'spin-efficiency', label: 'val-spin-efficiency', key: 'spinEfficiency' },
            { id: 'spin-rate', label: 'val-rpm', key: 'spinRate' },
            { id: 'ssw-alpha-front', label: 'val-alpha-front', key: 'alphaFront' },
            { id: 'ssw-induced-zone', label: 'val-induced-zone', key: 'inducedZone' },
            { id: 'ssw-induced-start', label: 'val-induced-start', key: 'inducedStart' },
            { id: 'ssw-natural-zone', label: 'val-natural-zone', key: 'naturalZone' },
            { id: 'ssw-alpha-back', label: 'val-alpha-back', key: 'alphaBack' },
        ];

        // Helper: get ordered plane slider elements
        const planeIds = ['ssw-alpha-front', 'ssw-induced-zone', 'ssw-induced-start', 'ssw-natural-zone', 'ssw-alpha-back'];

        for (const s of sliders) {
            const rangeEl = this._el(s.id);
            const inputEl = this._el(s.label);

            // Handler for update
            // Handler for update
            const update = (sourceEl, type = 'live') => {
                let val = parseFloat(sourceEl.value);

                // Enforce ordering for SSW planes
                const planeIdx = planeIds.indexOf(s.id);
                if (planeIdx >= 0) {
                    // Check bounds against neighbors
                    if (planeIdx > 0) {
                        const frontVal = parseFloat(this._el(planeIds[planeIdx - 1]).value);
                        if (val < frontVal) val = frontVal;
                    }
                    if (planeIdx < planeIds.length - 1) {
                        const backVal = parseFloat(this._el(planeIds[planeIdx + 1]).value);
                        if (val > backVal) val = backVal;
                    }
                }

                // Sync the other element
                if (s.isClock) {
                    // Range -> Text (Clock)
                    if (sourceEl === rangeEl) {
                        inputEl.value = angleToClockString(val * DEG2RAD);
                    }
                } else {
                    // Number <-> Number
                    if (sourceEl === rangeEl) {
                        inputEl.value = val;
                    } else {
                        rangeEl.value = val;
                    }

                    // Special Sync: Gyro Angle <-> Spin Efficiency
                    if (s.key === 'gyroAngle') {
                        const rad = val * DEG2RAD;
                        const eff = Math.abs(Math.cos(rad)) * 100;
                        const effRange = this._el('spin-efficiency');
                        const effInput = this._el('val-spin-efficiency');
                        if (effRange && effInput) {
                            effRange.value = eff;
                            effInput.value = Math.round(eff);
                        }
                    } else if (s.key === 'spinEfficiency') {
                        const currentGyro = parseFloat(this._el('gyro-angle').value);
                        const sign = currentGyro < 0 ? -1 : 1;
                        let safeVal = Math.max(0, Math.min(100, val));
                        let deg = Math.acos(safeVal / 100) * (180 / Math.PI);
                        deg = deg * sign;

                        const gyroRange = this._el('gyro-angle');
                        const gyroInput = this._el('val-gyro');
                        if (gyroRange && gyroInput) {
                            gyroRange.value = deg;
                            gyroInput.value = Math.round(deg);
                        }

                        this.onChange({ key: 'gyroAngle', value: deg * DEG2RAD, type });
                    }
                }

                // If we corrected 'val' due to constraints, update source too if needed
                if (sourceEl.value != val && !s.isClock) {
                    sourceEl.value = val;
                }


                this.onChange({ key: s.key, value: parseFloat(rangeEl.value), type });
            };

            rangeEl.addEventListener('input', () => update(rangeEl, 'live'));
            rangeEl.addEventListener('change', () => update(rangeEl, 'committed'));

            // Add keydown listener for immediate keyboard response
            rangeEl.addEventListener('keydown', (e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    // Prevent default to avoid double-step or conflict
                    // But we need to manually update value
                    // e.preventDefault(); // Optional: if we want to fully control. 
                    // Actually, if we prevent default, the slider won't move visually until we set value.
                    // Let's try to let it move BUT simultaneously force update.

                    // The issue is 'input' fires AFTER the value change.
                    // If we want immediate response, we can calculate target value.

                    const step = parseFloat(rangeEl.step) || 1;
                    let val = parseFloat(rangeEl.value);
                    let handled = false;

                    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                        val += step;
                        handled = true;
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                        val -= step;
                        handled = true;
                    }

                    if (handled) {
                        // Clamp to min/max
                        const min = parseFloat(rangeEl.min);
                        const max = parseFloat(rangeEl.max);
                        if (!isNaN(min)) val = Math.max(min, val);
                        if (!isNaN(max)) val = Math.min(max, val);

                        // Manually update
                        rangeEl.value = val;
                        // Fire updates
                        update(rangeEl, 'live'); // For Dashboard (immediate)
                        update(rangeEl, 'committed'); // For Curves (after short delay logic in main)

                        e.preventDefault(); // Stop browser from doing it again
                    }
                }
            });

            if (!s.isClock) {
                inputEl.addEventListener('change', () => update(inputEl, 'committed'));
                inputEl.addEventListener('input', () => update(inputEl, 'live'));
            }
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

    _bindVisibility() {
        this._el('check-visible-seam').addEventListener('change', (e) => this.onChange({ key: 'visibleSeam', value: e.target.checked }));
        this._el('check-visible-contrib').addEventListener('change', (e) => this.onChange({ key: 'visibleContrib', value: e.target.checked }));
    }

    _bindLang() {
        this._el('btn-lang').addEventListener('click', () => {
            const newLang = toggleLang();
            this._el('btn-lang').textContent = t('langSwitch');
            // Re-format dynamic labels
            this._el('val-spin-dir').value = angleToClockString(this.spinDirection);
            const btn = this._el('btn-play-pause');
            btn.textContent = this.isPlaying ? t('pause') : t('play');
        });
    }

    _bindViewButtons() {
        this._el('btn-pitcher').addEventListener('click', () => this.onChange({ key: 'pitcherView' }));
        this._el('btn-catcher').addEventListener('click', () => this.onChange({ key: 'catcherView' }));
    }

    _bindHelp() {
        const btn = this._el('btn-help');
        const modal = this._el('help-modal');
        const close = this._el('btn-close-help');

        if (btn && modal && close) {
            btn.addEventListener('click', () => {
                modal.classList.remove('hidden');
            });
            close.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    }
}
