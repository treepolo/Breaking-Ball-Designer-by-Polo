export class SSWCharts {
    constructor(containerId) {
        this.containerId = containerId;
        this.charts = [];
        this.data = [];
        this.currentGyro = 0;

        this._initCharts();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.container || this.charts.length === 0) return;

        // Get current available width from the first wrapper (or container)
        // Since wrappers are block elements, they should fill the container.
        // We'll use the first chart's wrapper to determine width.
        const wrapper = this.charts[0].wrapper;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = 90; // Fixed height
        const dpr = window.devicePixelRatio || 1;

        for (const chart of this.charts) {
            chart.width = width;
            chart.height = height;

            // Limit canvas size to avoid huge memory usage if something goes wrong, 
            // but normally it's fine.
            if (width > 0) {
                chart.canvas.width = width * dpr;
                chart.canvas.height = height * dpr;
                chart.canvas.style.width = `${width}px`;
                chart.canvas.style.height = `${height}px`;

                // Reset context scale
                chart.ctx.setTransform(1, 0, 0, 1, 0, 0);
                chart.ctx.scale(dpr, dpr);
            }
        }

        this.draw();
    }

    _initCharts() {
        if (this.charts.length > 0) return;

        this.container = document.getElementById(this.containerId);
        if (!this.container) return;

        // Styles for container to clear stack
        // Handled by CSS
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        // this.container.style.gap = '8px';
        // this.container.style.pointerEvents = 'none'; // Overwrites CSS pointer-events: auto

        this.charts = [
            this._createChart('SSW半球指數 1', '#ef4444'),
            this._createChart('SSW半球指數 2', '#3b82f6'),
            this._createChart('SSW效果', '#10b981')
        ];

        // Trigger initial resize to fit container
        requestAnimationFrame(() => this.resize());
    }

    _createChart(title, lineColor) {
        const wrapper = document.createElement('div');
        wrapper.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        wrapper.style.borderRadius = '6px';
        wrapper.style.padding = '4px 8px';
        wrapper.style.pointerEvents = 'auto'; // allow tooltips?

        const header = document.createElement('div');
        header.textContent = title;
        header.style.color = '#cbd5e1';
        header.style.fontSize = '12px'; // Larger font
        header.style.marginBottom = '2px';
        header.style.fontWeight = '600';
        header.style.fontFamily = "'Outfit', sans-serif";

        const canvas = document.createElement('canvas');

        // HiDPI support + Double Size
        // HiDPI support + Double Size
        const dpr = window.devicePixelRatio || 1;
        // Initial dummy size, will be resized immediately
        const width = 100;
        const height = 90;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = '100%'; // Allow CSS to control width
        canvas.style.height = `${height}px`;
        canvas.style.display = 'block';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        wrapper.appendChild(header);
        wrapper.appendChild(canvas);
        this.container.appendChild(wrapper);

        return { ctx, canvas, wrapper, lineColor, title, width, height, dpr };
    }

    updateData(data) {
        this._initCharts();
        if (this.charts.length === 0) return;
        this.data = data;
        this.draw();
    }

    updateCursor(gyro) {
        this._initCharts();
        if (this.charts.length === 0) return;
        this.currentGyro = gyro; // in degrees
        this.draw();
    }

    draw() {
        if (this.charts.length === 0) return;

        // If no data, show "Waiting..." on all charts
        if (!this.data || this.data.length === 0) {
            for (const chart of this.charts) {
                const { ctx, width, height } = chart;
                ctx.clearRect(0, 0, width, height); // logical pixels
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.font = '14px "Outfit", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('計算中...', width / 2, height / 2);
            }
            return;
        }

        // 1. Determine Scales
        const minX = -90;
        const maxX = 90;

        // Y for Hemispheres (Charts 0 & 1)
        let maxHemi = 0;
        let minHemi = Infinity;
        let maxEffect = 0;

        for (const p of this.data) {
            maxHemi = Math.max(maxHemi, p.effectSumA, p.effectSumB);
            minHemi = Math.min(minHemi, p.effectSumA, p.effectSumB);
            maxEffect = Math.max(maxEffect, p.sswEffectIndex);
        }

        if (minHemi === Infinity) minHemi = 0;

        // Add margin
        const yMaxHemi = maxHemi * 1.1 || 1.0;
        // Y min should be slightly lower than minHemi, but not below 0 if minHemi is close to 0?
        // User said: "Y axis minimum just a bit smaller than lowest value".
        const yMinHemi = Math.max(0, minHemi * 0.9); // 10% margin below

        const yMaxEffect = maxEffect * 1.1 || 1.0;
        const yMinEffect = 0;

        // Draw Charts
        this._drawChart(this.charts[0], this.data, p => p.effectSumA, yMaxHemi, minX, maxX, yMinHemi);
        this._drawChart(this.charts[1], this.data, p => p.effectSumB, yMaxHemi, minX, maxX, yMinHemi);
        this._drawChart(this.charts[2], this.data, p => p.sswEffectIndex, yMaxEffect, minX, maxX, yMinEffect);
    }

    _drawChart(chart, data, accessor, yMax, minX, maxX, yMin = 0) {
        const { ctx, width, height, lineColor } = chart;
        const w = width; // Logical width
        const h = height; // Logical height

        // Add padding to avoid edge clipping (increased for labels)
        const px = 25;
        const py = 15;

        // Clear must use logic coords because scale is applied
        ctx.clearRect(0, 0, w, h);

        // Helper to map coordinates
        const mapX = (deg) => {
            const range = maxX - minX;
            const norm = (deg - minX) / range;
            return px + norm * (w - 2 * px);
        };

        const mapY = (val) => {
            const range = yMax - yMin;
            const effectiveRange = range === 0 ? 1 : range;
            const normalized = (val - yMin) / effectiveRange;
            return (h - py) - (normalized * (h - 2 * py));
        };

        // Draw Zero Line? (If within range)
        if (yMin <= 0 && yMax >= 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            const y0 = mapY(0);
            ctx.moveTo(px, y0);
            ctx.lineTo(w - px, y0);
            ctx.stroke();
        }

        // Draw Axis Labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // X: -90, 0, 90
        ctx.fillText('-90', mapX(-90), h - py + 3);
        ctx.fillText('0', mapX(0), h - py + 3);
        ctx.fillText('90', mapX(90), h - py + 3);

        // Y Min/Max
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        // Draw Y Max label slightly offset
        ctx.fillText(yMax.toFixed(1), px - 4, mapY(yMax) + 5);

        ctx.textBaseline = 'top';
        // Draw Y Min label
        ctx.fillText(yMin.toFixed(1), px - 4, mapY(yMin) - 5);


        // Draw Data Curve
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2; // Crisp line

        let first = true;
        for (const p of data) {
            const x = mapX(p.gyro);
            const val = accessor(p);
            // Clamp value? Visual only needs calculate Y
            const y = mapY(val);

            // Should verify if y is within chart area?
            // Usually fine, data is bounded by logic.

            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw Red Cursor Line
        const cursorX = mapX(this.currentGyro);

        if (cursorX >= px && cursorX <= w - px) {
            ctx.beginPath();
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.moveTo(cursorX, py);
            ctx.lineTo(cursorX, h - py);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw Value Point
        const nearest = data.reduce((prev, curr) =>
            Math.abs(curr.gyro - this.currentGyro) < Math.abs(prev.gyro - this.currentGyro) ? curr : prev
        );

        if (nearest) {
            const val = accessor(nearest);
            const cx = mapX(nearest.gyro);
            const cy = mapY(val);

            // Draw point
            if (cy >= py && cy <= h - py) {
                ctx.beginPath();
                ctx.fillStyle = '#ffffff';
                ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                ctx.fill();

                // Text value
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.fontWeight = 'bold';

                // Adjust position
                const tx = cx < w / 2 ? cx + 8 : cx - 8;
                ctx.textAlign = cx < w / 2 ? 'left' : 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(val.toFixed(2), tx, cy);
            }
        }
    }
}
