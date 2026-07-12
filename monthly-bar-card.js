/**
 * monthly-bar-card.js
 * Lovelace Custom Card — Monatliche Balkendiagramme (kombiniert)
 * Vereint: Autarkie, Stromverbrauch, PV Ertrag, Wallbox, Wärmepumpe, Klimaanlage
 * Aktuelles Jahr + Vorjahr als Vergleichsbalken
 *
 * YAML:
 *   type: custom:monthly-bar-card
 *   card_type: energy      # autarkie | energy | pv | wallbox | wp | klima
 *   entity: sensor.xyz     # optional, überschreibt Preset-Default
 *   title: Mein Titel      # optional, überschreibt Preset-Default
 *   color: "#00b4d8"       # optional, überschreibt Preset-Default
 *
 * Wird über die UI hinzugefügt ("Karte hinzufügen" → "Monthly Bar Card"),
 * kann der Typ + optionale Overrides bequem im visuellen Editor gewählt werden.
 */

// ── Presets für die verschiedenen Card-Typen ────────────────────────────────

const PRESETS = {
  autarkie: {
    label:      'Autarkie',
    entity:     'sensor.fronius_portal_autarkiegrad',
    title:      'Autarkie',
    color:      '#22c55e',
    unit:       '%',
    statType:   'mean',      // 'mean' = Durchschnittswert je Monat (recorder mean)
    fixedMax:   100,         // Y-Achse fix 0–100 %
    aggregate:  'avg',       // Summary-Wert: Durchschnitt statt Summe
    valueSuffix: '%',
  },
  energy: {
    label:      'Stromverbrauch',
    entity:     'sensor.haus_strom_energie',
    title:      'Stromverbrauch',
    color:      '#00b4d8',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  pv: {
    label:      'PV Ertrag',
    entity:     'sensor.fronius_portal_pv_energie_gesamt',
    title:      'PV Ertrag',
    color:      '#f59e0b',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  wallbox: {
    label:      'Wallbox Ladung',
    entity:     'sensor.wallbox_energie_gesamt',
    title:      'Wallbox Ladung',
    color:      '#3b82f6',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  wp: {
    label:      'Wärmepumpe',
    entity:     'sensor.warmepumpe_energie',
    title:      'Wärmepumpe',
    color:      '#ef4444',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  klima: {
    label:      'Klimaanlage',
    entity:     'sensor.klimaanlage_energie',
    title:      'Klimaanlage',
    color:      '#06b6d4',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
};

const CARD_TYPE_KEYS = Object.keys(PRESETS);

// ── Haupt-Card ───────────────────────────────────────────────────────────

class MonthlyBarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data      = new Array(12).fill(null);
    this._prevData  = new Array(12).fill(null);
    this._loading   = true;
    this._error     = null;
    this._lastFetch = 0;
    this._width     = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  connectedCallback() {
    this._ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (Math.abs(w - this._width) > 4) {
          this._width = w;
          this._render();
        }
      }
    });
    this._ro.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  // ── HA hooks ──────────────────────────────────────────────────────────

  setConfig(config) {
    const cardType = CARD_TYPE_KEYS.includes(config.card_type) ? config.card_type : 'energy';
    const preset = PRESETS[cardType];

    this._config = {
      card_type: cardType,
      entity:    config.entity ?? preset.entity,
      title:     config.title  ?? preset.title,
      color:     config.color  ?? preset.color,
    };
    this._preset = preset;

    // Bei Config-Wechsel Daten neu laden
    this._lastFetch = 0;
    this._data      = new Array(12).fill(null);
    this._prevData  = new Array(12).fill(null);
    this._loading   = true;
    this._render();

    if (this._hass) this._fetchData();
  }

  set hass(hass) {
    this._hass = hass;
    if (Date.now() - this._lastFetch > 3_600_000) {
      this._lastFetch = Date.now();
      this._fetchData();
    }
  }

  static getConfigElement() {
    return document.createElement('monthly-bar-card-editor');
  }

  static getStubConfig() {
    return { card_type: 'energy' };
  }

  // Moderner Weg (HA rendert automatisch ein natives <ha-form>, falls die
  // Editor-Komponente unten aus irgendeinem Grund nicht greift). Dient als
  // Fallback/zusätzliche Absicherung, damit garantiert eine GUI-Maske erscheint.
  static getConfigForm() {
    return {
      schema: [
        {
          name: 'card_type',
          required: true,
          selector: {
            select: {
              mode: 'dropdown',
              options: CARD_TYPE_KEYS.map(k => ({ value: k, label: PRESETS[k].label })),
            },
          },
        },
        { name: 'entity', selector: { entity: {} } },
        { name: 'title', selector: { text: {} } },
        { name: 'color', selector: { text: { type: 'color' } } },
      ],
      computeLabel: (schema) => ({
        card_type: 'Kartentyp',
        entity: 'Entity (optional, überschreibt Preset)',
        title: 'Titel (optional, überschreibt Preset)',
        color: 'Farbe (optional, überschreibt Preset)',
      })[schema.name] ?? schema.name,
    };
  }


  // ── Datenabruf ────────────────────────────────────────────────────────

  async _fetchYear(year) {
    const statType = this._preset.statType; // 'mean' oder 'change'
    const wsRequest = {
      type:          'recorder/statistics_during_period',
      start_time:    new Date(year, 0, 1).toISOString(),
      end_time:      new Date(year + 1, 0, 1).toISOString(),
      statistic_ids: [this._config.entity],
      period:        'month',
      types:         [statType],
    };
    if (statType === 'change') {
      wsRequest.units = { energy: 'kWh' };
    }

    const result = await this._hass.callWS(wsRequest);
    const stats = result?.[this._config.entity] ?? [];
    return Array.from({ length: 12 }, (_, month) => {
      const entry = stats.find(s => new Date(s.start).getMonth() === month);
      return entry?.[statType] ?? null;
    });
  }

  async _fetchData() {
    this._loading = true;
    this._error   = null;
    this._render();

    const year = new Date().getFullYear();
    try {
      const [cur, prev] = await Promise.all([
        this._fetchYear(year),
        this._fetchYear(year - 1),
      ]);
      this._data     = cur;
      this._prevData = prev;
    } catch (err) {
      console.error('[monthly-bar-card]', err);
      this._error = err.message ?? 'Unbekannter Fehler';
    }

    this._loading = false;
    this._render();
  }

  // ── Hilfsfunktionen ───────────────────────────────────────────────────

  _niceMax(val) {
    if (val <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    for (const n of [1, 2, 2.5, 5, 10]) {
      if (n * mag >= val) return n * mag;
    }
    return 10 * mag;
  }

  _layoutParams(px) {
    if (px < 280) {
      return { H: 160, pad: { top: 18, right: 6, bottom: 24, left: 34 },
               fMonth: 8, fAxis: 8, fVal: 0, monthStyle: 'initial', barRatio: 0.7 };
    }
    if (px < 420) {
      return { H: 185, pad: { top: 22, right: 8, bottom: 28, left: 42 },
               fMonth: 9, fAxis: 9, fVal: 0, monthStyle: 'abbr', barRatio: 0.72 };
    }
    if (px < 560) {
      return { H: 210, pad: { top: 24, right: 10, bottom: 30, left: 48 },
               fMonth: 10, fAxis: 10, fVal: 8, monthStyle: 'abbr', barRatio: 0.74 };
    }
    return { H: 230, pad: { top: 28, right: 14, bottom: 34, left: 54 },
             fMonth: 10, fAxis: 10, fVal: 9, monthStyle: 'abbr', barRatio: 0.76 };
  }

  // ── SVG-Chart ─────────────────────────────────────────────────────────

  _buildChart(currentMonth) {
    const MONTHS_ABBR    = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const MONTHS_INITIAL = ['J','F','M','A','M','J','J','A','S','O','N','D'];

    const px = this._width || 400;
    const lp = this._layoutParams(px);
    const { H, pad, fMonth, fAxis, fVal, monthStyle, barRatio } = lp;

    const W     = px;
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const slotW = plotW / 12;

    const gap    = slotW * 0.06;
    const barW   = (slotW * barRatio - gap) / 2;
    const pairW  = barW * 2 + gap;
    const pairOff = (slotW - pairW) / 2;

    const color        = this._config.color;
    const colorDim     = color + '55';
    const colorPrev    = '#888888';
    const colorPrevDim = '#88888844';

    // Max-Wert: fest (z.B. Autarkie 0–100%) oder dynamisch berechnet
    let maxVal;
    if (this._preset.fixedMax != null) {
      maxVal = this._preset.fixedMax;
    } else {
      const allVals = [...this._data, ...this._prevData].filter(v => v !== null && v >= 0);
      maxVal = this._niceMax(allVals.length ? Math.max(...allVals) : 0);
    }

    const TICKS = px < 280 ? 4 : 5;
    let grid = '', yLabels = '';
    for (let i = 0; i <= TICKS; i++) {
      const v = (maxVal / TICKS) * i;
      const y = pad.top + plotH - (v / maxVal) * plotH;
      grid    += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + plotW}" y2="${y.toFixed(1)}" stroke="var(--divider-color)" stroke-width="0.5" stroke-dasharray="4 3"/>`;
      yLabels += `<text x="${pad.left - 4}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="${fAxis}" fill="var(--secondary-text-color)">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
    }

    let bars = '', xLabels = '', valLabels = '';
    for (let i = 0; i < 12; i++) {
      const slotX   = pad.left + i * slotW + pairOff;
      const cx      = pad.left + i * slotW + slotW / 2;
      const valCur  = this._data[i];
      const valPrev = this._prevData[i];
      const isFuture  = i > currentMonth;
      const isCurrent = i === currentMonth;

      // Vorjahr-Balken (links)
      const xPrev = slotX;
      if (valPrev !== null) {
        const bH   = Math.max((valPrev / maxVal) * plotH, 1);
        const bY   = pad.top + plotH - bH;
        const fill = isFuture ? colorPrevDim : colorPrev;
        bars += `<rect x="${xPrev.toFixed(1)}" y="${bY.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${fill}" rx="2"/>`;
      } else if (!isFuture) {
        bars += `<rect x="${xPrev.toFixed(1)}" y="${(pad.top + plotH - 1).toFixed(1)}" width="${barW.toFixed(1)}" height="1" fill="var(--divider-color)" rx="1"/>`;
      }

      // Aktuelles Jahr-Balken (rechts)
      const xCur = slotX + barW + gap;
      if (!isFuture && valCur !== null) {
        const bH   = Math.max((valCur / maxVal) * plotH, 1);
        const bY   = pad.top + plotH - bH;
        const fill = isCurrent ? color : colorDim;
        bars += `<rect x="${xCur.toFixed(1)}" y="${bY.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${fill}" rx="2"/>`;
        if (fVal > 0 && valCur > 0) {
          valLabels += `<text x="${(xCur + barW / 2).toFixed(1)}" y="${(bY - 3).toFixed(1)}" text-anchor="middle" font-size="${fVal}" fill="var(--primary-text-color)">${valCur.toFixed(0)}${this._preset.valueSuffix}</text>`;
        }
      } else if (isFuture) {
        bars += `<rect x="${xCur.toFixed(1)}" y="${(pad.top + plotH - 3).toFixed(1)}" width="${barW.toFixed(1)}" height="3" fill="var(--divider-color)" rx="1"/>`;
      }

      const label  = monthStyle === 'initial' ? MONTHS_INITIAL[i] : MONTHS_ABBR[i];
      const weight = isCurrent ? 'bold' : 'normal';
      const fcolor = isCurrent ? 'var(--primary-text-color)' : 'var(--secondary-text-color)';
      xLabels += `<text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="${fMonth}" font-weight="${weight}" fill="${fcolor}">${label}</text>`;
    }

    // Legende
    let legend = '';
    if (px >= 280) {
      const year = new Date().getFullYear();
      const ly = pad.top - 6;
      const lx = pad.left + plotW;
      legend = `
        <rect x="${(lx - 130).toFixed(1)}" y="${(ly - 8).toFixed(1)}" width="10" height="10" fill="${colorPrev}" rx="2"/>
        <text x="${(lx - 117).toFixed(1)}" y="${(ly + 1).toFixed(1)}" font-size="9" fill="var(--secondary-text-color)">${year - 1}</text>
        <rect x="${(lx - 76).toFixed(1)}" y="${(ly - 8).toFixed(1)}" width="10" height="10" fill="${color}" rx="2"/>
        <text x="${(lx - 63).toFixed(1)}" y="${(ly + 1).toFixed(1)}" font-size="9" fill="var(--secondary-text-color)">${year}</text>
      `;
    }

    const unitLabel = `<text x="${(pad.left - 4).toFixed(1)}" y="${(pad.top - 10).toFixed(1)}" text-anchor="middle" font-size="${fAxis}" fill="var(--secondary-text-color)">${this._preset.unit}</text>`;
    const axes = `
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
    `;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
      ${grid}${bars}${valLabels}${xLabels}${yLabels}${unitLabel}${axes}${legend}
    </svg>`;
  }

  // ── Summary (Durchschnitt oder Summe je nach Preset) ─────────────────

  _summary(arr) {
    const vals = arr.filter(v => v !== null);
    if (!vals.length) return null;
    if (this._preset.aggregate === 'avg') {
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return vals.reduce((a, b) => a + b, 0);
  }

  _formatSummary(val) {
    if (val === null) return '–';
    const unit = this._preset.unit;
    if (this._preset.aggregate === 'avg') {
      return `Ø ${val.toFixed(1)} ${unit}`;
    }
    return `${val.toFixed(0)} ${unit}`;
  }

  // ── Render ────────────────────────────────────────────────────────────

  _render() {
    if (!this._config) return;

    const now          = new Date();
    const year         = now.getFullYear();
    const currentMonth = now.getMonth();
    const sumCur       = this._summary(this._data);
    const sumPrev      = this._summary(this._prevData);
    const px           = this._width || 0;

    let body;
    if (this._loading) {
      body = `<div class="loading">Lade Daten…</div>`;
    } else if (this._error) {
      body = `<div class="error">Fehler: ${this._error}</div>`;
    } else {
      const showTotal = px === 0 || px >= 280;
      body = `
        ${showTotal ? `
          <div class="totals">
            <span class="tot-item"><span class="dot" style="background:var(--color-prev)"></span>${year - 1}: <strong>${this._formatSummary(sumPrev)}</strong></span>
            <span class="tot-item"><span class="dot" style="background:var(--color-cur)"></span>${year}: <strong>${this._formatSummary(sumCur)}</strong></span>
          </div>` : ''}
        <div class="chart-wrap">${this._buildChart(currentMonth)}</div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          box-sizing: border-box;
          --color-prev: #888888;
          --color-cur: ${this._config.color};
        }
        ha-card { width: 100%; }
        .card-header {
          padding: 14px 14px 2px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .year-label {
          padding: 0 14px 4px;
          font-size: 22px;
          font-weight: 700;
          color: var(--primary-text-color);
        }
        .totals {
          display: flex;
          gap: 16px;
          padding: 0 14px 8px;
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        .tot-item { display: flex; align-items: center; gap: 5px; }
        .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
        .chart-wrap { padding: 0 6px 10px; }
        .loading {
          padding: 28px 14px;
          text-align: center;
          color: var(--secondary-text-color);
          font-size: 13px;
        }
        .error {
          padding: 14px;
          color: var(--error-color, red);
          font-size: 12px;
        }
      </style>
      <ha-card>
        <div class="card-header">${this._config.title}</div>
        <div class="year-label">${year}</div>
        ${body}
      </ha-card>
    `;

    this.shadowRoot.querySelector('ha-card').addEventListener('dblclick', () => {
      this._lastFetch = 0;
      if (this._hass) this._fetchData();
    });
  }

  getCardSize() { return 4; }
}

customElements.define('monthly-bar-card', MonthlyBarCard);

// ── Visueller Config-Editor ──────────────────────────────────────────────
// Nutzt native HA-Formularelemente (<ha-selector>), damit die Eingabemaske
// exakt aussieht wie bei eingebauten Home-Assistant-Cards: Dropdown für den
// Kartentyp, durchsuchbarer Entity-Picker, Text- und Farbfelder.
// Es muss NICHTS per YAML eingetragen werden — alles läuft über diese GUI.

class MonthlyBarCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Entity-Picker etc. brauchen hass für Autovervollständigung/Anzeige
    this.querySelectorAll('ha-selector').forEach(sel => { sel.hass = hass; });
  }

  get _cardType() {
    return CARD_TYPE_KEYS.includes(this._config?.card_type) ? this._config.card_type : 'energy';
  }

  _fireChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _onTypeChange(value) {
    // Overrides zurücksetzen, damit die Presets des neuen Typs greifen.
    this._config = { card_type: value };
    this._render();
    this._fireChanged();
  }

  _onFieldChange(field, value) {
    if (value === '' || value == null) {
      delete this._config[field];
    } else {
      this._config[field] = value;
    }
    this._fireChanged();
  }

  _row(labelText, hintText, selectorObj, field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const selector = document.createElement('ha-selector');
    selector.hass = this._hass;
    selector.selector = selectorObj;
    selector.value = value ?? '';

    selector.addEventListener('value-changed', ev => {
      ev.stopPropagation();
      const newVal = ev.detail.value;
      if (field === 'card_type') {
        this._onTypeChange(newVal);
      } else {
        this._onFieldChange(field, newVal);
      }
    });
    wrap.appendChild(selector);

    if (hintText) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = hintText;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  _render() {
    if (!this._config) return;
    const preset = PRESETS[this._cardType];

    this.innerHTML = `
      <style>
        .editor-form { display: flex; flex-direction: column; gap: 16px; padding: 4px 0; }
        .editor-row { display: flex; flex-direction: column; gap: 4px; }
        label { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
        .hint { font-size: 11px; color: var(--secondary-text-color); }
      </style>
      <div class="editor-form"></div>
    `;

    const form = this.querySelector('.editor-form');

    form.appendChild(this._row(
      'Kartentyp',
      null,
      { select: { mode: 'dropdown', options: CARD_TYPE_KEYS.map(k => ({ value: k, label: PRESETS[k].label })) } },
      'card_type',
      this._cardType,
    ));

    form.appendChild(this._row(
      'Entity',
      `Optional — Standard für "${preset.label}": ${preset.entity}`,
      { entity: {} },
      'entity',
      this._config.entity,
    ));

    form.appendChild(this._row(
      'Titel',
      `Optional — Standard: ${preset.title}`,
      { text: {} },
      'title',
      this._config.title,
    ));

    form.appendChild(this._row(
      'Farbe',
      `Optional — Standard: ${preset.color}`,
      { text: { type: 'color' } },
      'color',
      this._config.color,
    ));
  }
}

customElements.define('monthly-bar-card-editor', MonthlyBarCardEditor);

// ── Registrierung bei HACS / "Karte hinzufügen"-Dialog ──────────────────

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'monthly-bar-card',
  name: 'Monthly Bar Card',
  description: 'Monatliches Balkendiagramm (Autarkie, Stromverbrauch, PV, Wallbox, Wärmepumpe, Klimaanlage) — aktuelles Jahr vs. Vorjahr.',
});
