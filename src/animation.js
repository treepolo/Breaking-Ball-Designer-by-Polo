import { DEG2RAD } from './constants.js';

export class AnimationController {
    constructor(canvas, ui, onUpdate) {
        this.canvas = canvas;
        this.ui = ui;
        this.onUpdate = onUpdate;
        this.isPlaying = false;
        this.animationAngle = 0;
        this.lastTime = 0;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartAngle = 0;
        this._bindDrag();
    }

    tick(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (this.isPlaying) {
            const radsPerSec = (this.ui.spinRate / 60) * Math.PI * 2;
            this.animationAngle += radsPerSec * dt;
            this.onUpdate(this.animationAngle);
        }
    }

    setPlaying(playing) {
        this.isPlaying = playing;
        if (playing) this.lastTime = 0;
    }

    _bindDrag() {
        this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
        window.addEventListener('pointermove', (e) => this._onMove(e));
        window.addEventListener('pointerup', () => this._onUp());
    }

    _onDown(e) {
        if (this.isPlaying) return;
        if (e.target.closest('#control-panel')) return;
        // Only start drag with middle or right mouse, or if alt key is held
        // Otherwise let OrbitControls handle it
        if (!e.altKey && e.button === 0) return;
        this._dragging = true;
        this._dragStartX = e.clientX;
        const axis = this.ui.dragAxis;
        const el = document.getElementById(axis === 'x' ? 'orient-x' : axis === 'y' ? 'orient-y' : 'orient-z');
        this._dragStartAngle = parseFloat(el.value);
        this.canvas.style.cursor = 'grabbing';
    }

    _onMove(e) {
        if (!this._dragging) return;
        const dx = e.clientX - this._dragStartX;
        let newAngle = Math.max(-180, Math.min(180, this._dragStartAngle + dx * 0.5));
        const axis = this.ui.dragAxis;
        if (axis === 'x') this.ui.setOrientX(Math.round(newAngle));
        else if (axis === 'y') this.ui.setOrientY(Math.round(newAngle));
        else this.ui.setOrientZ(Math.round(newAngle));
        this.ui.onChange({ key: 'drag', value: newAngle });
    }

    _onUp() {
        if (this._dragging) {
            this._dragging = false;
            this.canvas.style.cursor = 'default';
        }
    }
}
