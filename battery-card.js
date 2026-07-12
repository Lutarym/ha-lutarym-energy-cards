class BydBatteryCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._config || !this._config.entity) return; // hass kann vor setConfig eintreffen (z.B. Editor-Vorschau)

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
    if (this._hass) this.hass = this._hass; // hass war schon da (z.B. Editor-Vorschau) → jetzt nachträglich anwenden
  }

  getCardSize() { return 1; }

  static getConfigElement() {
    return document.createElement('battery-card-editor');
  }

  static getStubConfig() {
    return { entity: 'sensor.byd_battery_box_premium_hv_ladezustand', height: 60, animation: 0, name: 'BYD Batteriestand', show_name: true, show_percent: true };
  }
}

// ── Visueller Config-Editor ──────────────────────────────────────────────

class BatteryCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.querySelectorAll('ha-selector').forEach(sel => { sel.hass = hass; });
  }

  _fireChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  _onChange(field, value, isNumber) {
    if (value === '' || value == null) {
      delete this._config[field];
    } else {
      this._config[field] = isNumber ? Number(value) : value;
    }
    this._fireChanged();
  }

  _textRow(label, field, value, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', ev => this._onChange(field, ev.target.value));
    wrap.appendChild(input);
    return wrap;
  }

  _numberRow(label, field, value, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'number';
    if (value != null) input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', ev => this._onChange(field, ev.target.value, true));
    wrap.appendChild(input);
    return wrap;
  }

  _entityRow(label, field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const selector = document.createElement('ha-selector');
    selector.hass = this._hass;
    selector.selector = { entity: {} };
    selector.value = value ?? '';
    selector.addEventListener('value-changed', ev => {
      ev.stopPropagation();
      this._onChange(field, ev.detail.value);
    });
    wrap.appendChild(selector);
    return wrap;
  }

  _selectRow(label, field, value, options) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const select = document.createElement('select');
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (String(opt.value) === String(value)) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', ev => this._onChange(field, ev.target.value, true));
    wrap.appendChild(select);
    return wrap;
  }

  _checkboxRow(label, field, value, defaultTrue) {
    const wrap = document.createElement('div');
    wrap.className = 'row checkbox-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value != null ? !!value : !!defaultTrue;
    input.addEventListener('change', ev => this._onChange(field, ev.target.checked));
    wrap.appendChild(input);
    wrap.appendChild(l);
    return wrap;
  }

  _render() {
    if (!this._config) return;
    const cfg = this._config;

    this.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
        .row { display: flex; flex-direction: column; gap: 4px; }
        .row label { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
        .row input[type="text"], .row input[type="number"], .row select {
          padding: 8px 10px; border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px; background: var(--card-background-color, #fff);
          color: var(--primary-text-color); font-size: 14px; box-sizing: border-box;
        }
        .checkbox-row { flex-direction: row; align-items: center; gap: 8px; }
        .checkbox-row label { font-weight: 400; }
        .row-pair { display: flex; gap: 16px; }
        .row-pair > .row { flex: 1; min-width: 0; }
      </style>
      <div class="form"></div>
    `;
    const form = this.querySelector('.form');

    form.appendChild(this._entityRow('Batterie-Ladezustand-Entity (Pflicht, %)', 'entity', cfg.entity));
    form.appendChild(this._textRow('Name', 'name', cfg.name, 'BYD Batteriestand'));

    const animRow = this._selectRow('Animationsstil', 'animation', cfg.animation ?? 0, [
      { value: 0, label: '0 – Statisch' },
      { value: 1, label: '1 – Wellen' },
      { value: 2, label: '2 – Pulsieren' },
      { value: 3, label: '3 – Blasen' },
      { value: 4, label: '4 – Glitzer' },
      { value: 5, label: '5 – Sanft auffüllend' },
      { value: 6, label: '6 – Schimmern' },
      { value: 7, label: '7 – Blitz' },
      { value: 8, label: '8 – Regen' },
      { value: 9, label: '9 – Feuer' },
      { value: 10, label: '10 – Matrix' },
      { value: 11, label: '11 – Scanline' },
      { value: 12, label: '12 – Herzschlag' },
    ]);
    form.appendChild(animRow);

    const sizePair = document.createElement('div');
    sizePair.className = 'row-pair';
    sizePair.appendChild(this._numberRow('Höhe (px)', 'height', cfg.height, '60'));
    sizePair.appendChild(this._numberRow('Breite (px, optional)', 'width', cfg.width, 'automatisch'));
    form.appendChild(sizePair);

    form.appendChild(this._numberRow('Schriftgröße Prozentanzeige (px, optional)', 'percent_size', cfg.percent_size, 'automatisch'));
    form.appendChild(this._checkboxRow('Name anzeigen', 'show_name', cfg.show_name, true));
    form.appendChild(this._checkboxRow('Prozentanzeige anzeigen', 'show_percent', cfg.show_percent, true));
  }
}

customElements.define('battery-card-editor', BatteryCardEditor);

customElements.define('battery-card', BydBatteryCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'battery-card',
  name: 'BYD Battery by Lutarym',
  description: 'Grafische Batteriestandsanzeige mit sanftem Farbverlauf'
});
