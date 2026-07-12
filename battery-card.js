class BydBatteryCard extends HTMLElement {
  set hass(hass) {
    const state = hass.states[this._config.entity];
    const newPct = state ? Math.max(0, Math.min(100, parseFloat(state.state))) : 0;

    if (!this._built) {
      this._built = true;
      this._displayPct = 0;
      this._pct = newPct;
      this._build();
    } else {
      this._pct = newPct;
    }

    if (this._label) this._label.textContent = newPct.toFixed(0) + ' %';
  }

  _build() {
    const h = this._config.height || 60;
    const w = this._config.width || Math.round(h * 0.47);
    const tip = Math.round(w * 0.45);
    const border = h < 50 ? 2 : 3;
    const showName = String(this._config.show_name) !== 'false';
    const showPercent = String(this._config.show_percent) !== 'false';
    const name = this._config.name ?? 'BYD Batteriestand';
    const pctFontSize = (this._config.percent_size || Math.max(10, w * 0.25)) + 'px';

    const card = document.createElement('ha-card');
    card.style.display = 'inline-block';
    card.innerHTML = `
      <style>
        .wrap { display:inline-flex; flex-direction:row; align-items:center; padding:12px; gap:16px; }
        .title { font-size:0.9rem; font-weight:600; color:var(--primary-text-color); }
        .battery-outer {
          width:${w}px; height:${h}px;
          border:${border}px solid var(--primary-text-color);
          border-radius:4px; position:relative; overflow:hidden;
          background:var(--card-background-color,#1c1c1c); flex-shrink:0;
        }
        .battery-tip {
          width:${tip}px; height:5px; background:var(--primary-text-color);
          border-radius:2px 2px 0 0; position:absolute; top:-5px; left:50%;
          transform:translateX(-50%); opacity:0.6;
        }
        .info { display:flex; flex-direction:column; gap:2px; }
      </style>
      <div class="wrap">
        <div style="position:relative; margin-top:5px;">
          <div class="battery-tip"></div>
          <div class="battery-outer" id="bat-outer">
            <div id="bat-label" style="display:${showPercent ? '' : 'none'}; position:absolute; width:100%; text-align:center; bottom:6px; font-weight:bold; font-size:${pctFontSize}; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.6); z-index:1; pointer-events:none;">--%</div>
          </div>
        </div>
        <div class="info" style="display:${showName ? '' : 'none'}">
          <div class="title">${name}</div>
        </div>
      </div>`;

    this.appendChild(card);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    card.querySelector('#bat-outer').appendChild(canvas);

    this._canvas = canvas;
    this._label = card.querySelector('#bat-label');
    this._W = w;
    this._H = h;
    this._particles = [];
    this._matrixCols = [];
    this._heartT = 0;

    setTimeout(() => this._startAnimation(), 100);
  }

  _lerp(a, b, x) { return a + (b - a) * x; }

  _pctToRGB(p) {
    const r0=220,g0=30,b0=30, r1=253,g1=216,b1=53, r2=46,g2=125,b2=50;
    let r,g,b;
    if (p <= 50) { const x=p/50; r=this._lerp(r0,r1,x); g=this._lerp(g0,g1,x); b=this._lerp(b0,b1,x); }
    else { const x=(p-50)/50; r=this._lerp(r1,r2,x); g=this._lerp(g1,g2,x); b=this._lerp(b1,b2,x); }
    return [Math.round(r),Math.round(g),Math.round(b)];
  }

  _baseFill(ctx, W, H, pct, t, yBase) {
    const drift = Math.sin(t) * 4;
    const [r1,g1,b1] = this._pctToRGB(Math.max(0, pct - 15 + drift));
    const [r2,g2,b2] = this._pctToRGB(Math.min(100, pct + 15 + drift));
    const grad = ctx.createLinearGradient(0, H, 0, yBase);
    grad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
    grad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, yBase, W, H - yBase);
  }

  _drawFill(ctx, W, H, pct, t, mode) {
    const fillH = H * pct / 100;
    if (fillH <= 0) return;
    const yBase = H - fillH;
    const drift = Math.sin(t) * 4;
    const [r1,g1,b1] = this._pctToRGB(Math.max(0, pct - 15 + drift));
    const [r2,g2,b2] = this._pctToRGB(Math.min(100, pct + 15 + drift));

    const solidGrad = () => {
      const g = ctx.createLinearGradient(0, H, 0, yBase);
      g.addColorStop(0, `rgb(${r1},${g1},${b1})`);
      g.addColorStop(1, `rgb(${r2},${g2},${b2})`);
      return g;
    };

    if (mode === 0) {
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);

    } else if (mode === 1) {
      const amp = Math.max(2, 5 * (1 - pct / 100));
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x++) {
        const y = yBase + amp * Math.sin(t*2 + x*0.25) + amp*0.4 * Math.sin(t*1.5 + x*0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = solidGrad(); ctx.fill();

    } else if (mode === 2) {
      const pulse = Math.sin(t*2) * (H*0.03);
      const pY = yBase + pulse;
      const g = ctx.createLinearGradient(0, H, 0, pY);
      g.addColorStop(0, `rgb(${r1},${g1},${b1})`); g.addColorStop(1, `rgb(${r2},${g2},${b2})`);
      ctx.fillStyle = g; ctx.fillRect(0, pY, W, H - pY);

    } else if (mode === 3) {
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      if (Math.random() < 0.08 && this._particles.length < 12)
        this._particles.push({ x: Math.random()*W, y: H, r: 1+Math.random()*3, speed: 0.3+Math.random()*0.5, type:'bubble' });
      this._particles = this._particles.filter(b => b.y > yBase);
      for (const b of this._particles) {
        b.y -= b.speed;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      }

    } else if (mode === 4) {
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      if (Math.random() < 0.15 && this._particles.length < 20)
        this._particles.push({ x: Math.random()*W, y: yBase+Math.random()*fillH, life: 1.0, type:'glitter' });
      this._particles = this._particles.filter(g => g.life > 0);
      for (const g of this._particles) {
        ctx.beginPath(); ctx.arc(g.x, g.y, 1.5, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,255,255,${g.life})`; ctx.fill();
        g.life -= 0.04;
      }

    } else if (mode === 5) {
      if (this._displayPct < pct) this._displayPct = Math.min(pct, this._displayPct + 0.5);
      const dH = H * this._displayPct / 100;
      const dY = H - dH;
      const g = ctx.createLinearGradient(0, H, 0, dY);
      g.addColorStop(0, `rgb(${r1},${g1},${b1})`); g.addColorStop(1, `rgb(${r2},${g2},${b2})`);
      ctx.fillStyle = g; ctx.fillRect(0, dY, W, dH);

    } else if (mode === 6) {
      const alpha = 0.7 + 0.3 * Math.sin(t*2);
      const g = ctx.createLinearGradient(0, H, 0, yBase);
      g.addColorStop(0, `rgba(${r1},${g1},${b1},${alpha})`);
      g.addColorStop(1, `rgba(${r2},${g2},${b2},${alpha})`);
      ctx.fillStyle = g; ctx.fillRect(0, yBase, W, fillH);

    } else if (mode === 7) {
      // Blitz
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      const blink = Math.sin(t * 3) > 0.7;
      if (blink) {
        ctx.save();
        ctx.translate(W/2, yBase + fillH*0.2);
        ctx.fillStyle = 'rgba(255,255,180,0.9)';
        ctx.beginPath();
        const s = Math.min(W, fillH) * 0.35;
        ctx.moveTo(s*0.2, 0); ctx.lineTo(-s*0.1, s*0.45);
        ctx.lineTo(s*0.1, s*0.45); ctx.lineTo(-s*0.2, s*0.9);
        ctx.lineTo(s*0.35, s*0.35); ctx.lineTo(s*0.1, s*0.35);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

    } else if (mode === 8) {
      // Regen
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      if (Math.random() < 0.2 && this._particles.length < 25)
        this._particles.push({ x: Math.random()*W, y: yBase, speed: 1+Math.random()*2, len: 3+Math.random()*5, type:'rain' });
      this._particles = this._particles.filter(r => r.y < H);
      for (const r of this._particles) {
        r.y += r.speed;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.len);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      }

    } else if (mode === 9) {
      // Feuer an der Oberfläche
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      const flameH = Math.min(fillH * 0.3, 15);
      for (let x = 0; x < W; x += 3) {
        const flicker = flameH * (0.5 + 0.5 * Math.sin(t*4 + x*0.5));
        const grad = ctx.createLinearGradient(0, yBase, 0, yBase - flicker);
        grad.addColorStop(0, 'rgba(255,100,0,0.8)');
        grad.addColorStop(1, 'rgba(255,220,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, yBase - flicker, 3, flicker);
      }

    } else if (mode === 10) {
      // Matrix
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      const colW = 8;
      const cols = Math.floor(W / colW);
      if (this._matrixCols.length !== cols) {
        this._matrixCols = Array.from({length: cols}, () => ({ y: Math.random() * H, speed: 0.5+Math.random() }));
      }
      ctx.font = `${colW-1}px monospace`;
      ctx.textAlign = 'center';
      for (let i = 0; i < cols; i++) {
        const col = this._matrixCols[i];
        if (col.y < yBase) { col.y = H; continue; }
        const char = String.fromCharCode(48 + Math.floor(Math.random()*10));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(char, i*colW + colW/2, col.y);
        col.y -= col.speed;
        if (col.y < yBase) col.y = H;
      }

    } else if (mode === 11) {
      // Scanline
      ctx.fillStyle = solidGrad(); ctx.fillRect(0, yBase, W, fillH);
      const scanY = yBase + ((t * 30) % fillH);
      const scanGrad = ctx.createLinearGradient(0, scanY-4, 0, scanY+4);
      scanGrad.addColorStop(0, 'rgba(255,255,255,0)');
      scanGrad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      scanGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY-4, W, 8);

    } else if (mode === 12) {
      // Herzschlag EKG
      const beat = (t % (Math.PI*2)) / (Math.PI*2);
      let offset = 0;
      if (beat < 0.1) offset = Math.sin(beat/0.1 * Math.PI) * (H*0.05);
      else if (beat < 0.2) offset = -Math.sin((beat-0.1)/0.1 * Math.PI) * (H*0.03);
      const hY = yBase + offset;
      const g = ctx.createLinearGradient(0, H, 0, hY);
      g.addColorStop(0, `rgb(${r1},${g1},${b1})`); g.addColorStop(1, `rgb(${r2},${g2},${b2})`);
      ctx.fillStyle = g; ctx.fillRect(0, hY, W, H - hY);
    }
  }

  _startAnimation() {
    const canvas = this._canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = this._W, H = this._H;
    const mode = parseInt(this._config.animation ?? 0);
    let t = 0;

    const loop = () => {
      if (!this.isConnected) return;
      ctx.clearRect(0, 0, W, H);
      this._drawFill(ctx, W, H, this._pct || 0, t, mode);
      if (mode > 0) t += 0.04;
      requestAnimationFrame(loop);
    };
    loop();
  }

  setConfig(config) {
    if (!config.entity) throw new Error('entity fehlt');
    this._config = config;
    this._built = false;
    this._pct = 0;
    this._displayPct = 0;
    this._particles = [];
    this._matrixCols = [];
    this.innerHTML = '';
  }

  getCardSize() { return 1; }

  static getStubConfig() {
    return { entity: 'sensor.byd_battery_box_premium_hv_ladezustand', height: 60, animation: 0, name: 'BYD Batteriestand', show_name: true, show_percent: true };
  }
}

customElements.define('battery-card', BydBatteryCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'battery-card',
  name: 'BYD Battery by Lutarym',
  description: 'Grafische Batteriestandsanzeige mit sanftem Farbverlauf'
});
