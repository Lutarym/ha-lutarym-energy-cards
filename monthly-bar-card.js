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
 *   color: "#00b4d8"       # optional, überschreibt Preset-Default (aktuelles Jahr)
 *   color_prev: "#888888"  # optional, überschreibt Preset-Default (Vorjahr)
 *   color_text: "#1c1c1c"  # optional, Text-/Wertefarbe (Standard: folgt Theme)
 *   color_dim: "#00b4d855" # optional, schwächerer Farbton (vergangene Monate, aktuelles Jahr)
 *   appearance: auto       # optional: auto | light | dark
 *   title_font_size: 14    # optional, Schriftgröße Titel in px (Standard: 14)
 *   label_font_size: 10    # optional, Schriftgröße Beschriftung im Diagramm in px (Standard: automatisch)
 *
 * Wird über die UI hinzugefügt ("Karte hinzufügen" → "Monthly Bar Card"),
 * kann der Typ + optionale Overrides bequem im visuellen Editor gewählt werden.
 */

// ── Presets für die verschiedenen Card-Typen ────────────────────────────────

const PRESETS = {
  autarkie: {
    label:      'Autarkie',
    entity:     'sensor.autarkie',
    title:      'Autarkie',
    color:      '#22c55e',
    colorPrev:  '#888888',
    unit:       '%',
    statType:   'mean',      // 'mean' = Durchschnittswert je Monat (recorder mean)
    fixedMax:   100,         // Y-Achse fix 0–100 %
    aggregate:  'avg',       // Summary-Wert: Durchschnitt statt Summe
    valueSuffix: '%',
  },
  energy: {
    label:      'Stromverbrauch',
    entity:     'sensor.stromverbrauch',
    title:      'Stromverbrauch',
    color:      '#00b4d8',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  pv: {
    label:      'PV Ertrag',
    entity:     'sensor.pv_ertrag',
    title:      'PV Ertrag',
    color:      '#f59e0b',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  wallbox: {
    label:      'Wallbox',
    entity:     'sensor.wallbox',
    title:      'Wallbox',
    color:      '#3b82f6',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  wp: {
    label:      'Wärmepumpe',
    entity:     'sensor.waermepumpe',
    title:      'Wärmepumpe',
    color:      '#ef4444',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  klima: {
    label:      'Klimaanlage',
    entity:     'sensor.klimaanlage',
    title:      'Klimaanlage',
    color:      '#06b6d4',
    colorPrev:  '#888888',
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

    const newEntity = config.entity ?? preset.entity;
    const entityOrTypeChanged =
      !this._config ||
      this._config.card_type !== cardType ||
      this._config.entity !== newEntity;

    this._config = {
      card_type:  cardType,
      entity:     newEntity,
      title:      config.title      ?? preset.title,
      color:      config.color      ?? preset.color,
      colorPrev:  config.color_prev ?? preset.colorPrev,
      colorText:  config.color_text ?? null,   // null = folgt Theme (var(--primary-text-color))
      colorDim:   config.color_dim  ?? null,   // null = automatisch abgeleiteter, schwächerer Farbton
      appearance: config.appearance ?? 'auto', // 'auto' | 'light' | 'dark'
      titleFontSize: Number(config.title_font_size) || 14,
      labelFontSize: config.label_font_size ? Number(config.label_font_size) : null, // null = automatisch (responsiv)
    };
    this._preset = preset;

    if (entityOrTypeChanged) {
      // Nur bei Typ- oder Entity-Wechsel Daten neu laden (nicht bei jedem
      // Tastendruck in Titel/Farbe im Editor — vermeidet Preview-Flackern).
      this._lastFetch = 0;
      this._data      = new Array(12).fill(null);
      this._prevData  = new Array(12).fill(null);
      this._loading   = true;
      if (this._hass) this._fetchData();
    }

    this._render();
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
        { name: 'color_prev', selector: { text: { type: 'color' } } },
        { name: 'color_text', selector: { text: { type: 'color' } } },
        { name: 'color_dim', selector: { text: { type: 'color' } } },
        {
          name: 'appearance',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'auto', label: 'Automatisch (Dashboard-Theme)' },
                { value: 'light', label: 'Hell erzwingen' },
                { value: 'dark', label: 'Dunkel erzwingen' },
              ],
            },
          },
        },
        { name: 'title_font_size', selector: { number: { min: 8, max: 32, mode: 'box', unit_of_measurement: 'px' } } },
        { name: 'label_font_size', selector: { number: { min: 6, max: 20, mode: 'box', unit_of_measurement: 'px' } } },
      ],
      computeLabel: (schema) => ({
        card_type: 'Kartentyp',
        entity: 'Entity (optional, überschreibt Preset)',
        title: 'Titel (optional, überschreibt Preset)',
        color: 'Farbe aktuelles Jahr (optional, überschreibt Preset)',
        color_prev: 'Farbe Vorjahr (optional, überschreibt Preset)',
        color_text: 'Farbe Text/Werte (optional)',
        color_dim: 'Farbe schwächerer Farbton (optional)',
        appearance: 'Darstellung',
        title_font_size: 'Schriftgröße Titel (optional, Standard 14px)',
        label_font_size: 'Schriftgröße Beschriftung (optional, Standard automatisch)',
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
    let lp;
    if (px < 280) {
      lp = { H: 160, pad: { top: 18, right: 6, bottom: 24, left: 34 },
             fMonth: 8, fAxis: 8, fVal: 0, monthStyle: 'initial', barRatio: 0.7 };
    } else if (px < 420) {
      lp = { H: 185, pad: { top: 22, right: 8, bottom: 28, left: 42 },
             fMonth: 9, fAxis: 9, fVal: 0, monthStyle: 'abbr', barRatio: 0.72 };
    } else if (px < 560) {
      lp = { H: 210, pad: { top: 24, right: 10, bottom: 30, left: 48 },
             fMonth: 10, fAxis: 10, fVal: 8, monthStyle: 'abbr', barRatio: 0.74 };
    } else {
      lp = { H: 230, pad: { top: 28, right: 14, bottom: 34, left: 54 },
             fMonth: 10, fAxis: 10, fVal: 9, monthStyle: 'abbr', barRatio: 0.76 };
    }

    // Feste Beschriftungsgröße überschreibt die responsiven Standardwerte
    // für Monats-, Achsen- und Wertebeschriftung (aktiviert Wertelabels auch
    // bei schmalen Karten, statt sie dort auszublenden).
    if (this._config.labelFontSize) {
      lp = { ...lp, fMonth: this._config.labelFontSize, fAxis: this._config.labelFontSize, fVal: this._config.labelFontSize };
    }

    return lp;
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
    const colorDim     = this._config.colorDim || (color + '55');
    const colorPrev    = this._config.colorPrev;
    const colorPrevDim = colorPrev + '44';
    const colorText    = this._config.colorText || 'var(--primary-text-color)';

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
          valLabels += `<text x="${(xCur + barW / 2).toFixed(1)}" y="${(bY - 3).toFixed(1)}" text-anchor="middle" font-size="${fVal}" fill="${colorText}">${valCur.toFixed(0)}${this._preset.valueSuffix}</text>`;
        }
      } else if (isFuture) {
        bars += `<rect x="${xCur.toFixed(1)}" y="${(pad.top + plotH - 3).toFixed(1)}" width="${barW.toFixed(1)}" height="3" fill="var(--divider-color)" rx="1"/>`;
      }

      const label  = monthStyle === 'initial' ? MONTHS_INITIAL[i] : MONTHS_ABBR[i];
      const weight = isCurrent ? 'bold' : 'normal';
      const fcolor = isCurrent ? colorText : 'var(--secondary-text-color)';
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

  // ── Darstellungsmodus (Automatisch folgt Dashboard-Theme via HA-CSS-Vars;
  //    Hell/Dunkel erzwingen lokale Overrides nur für diese Card-Instanz) ──

  _appearanceCSSVars() {
    const mode = this._config.appearance || 'auto';
    if (mode === 'light') {
      return `
        --primary-text-color: #1c1c1c;
        --secondary-text-color: #6b7280;
        --divider-color: #e0e0e0;
        --card-background-color: #ffffff;
      `;
    }
    if (mode === 'dark') {
      return `
        --primary-text-color: #e5e7eb;
        --secondary-text-color: #9ca3af;
        --divider-color: #3f3f46;
        --card-background-color: #1e1e1e;
      `;
    }
    return ''; // auto: nichts überschreiben, HA-Theme-Variablen greifen wie gewohnt
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
          --color-prev: ${this._config.colorPrev};
          --color-cur: ${this._config.color};
          ${this._appearanceCSSVars()}
        }
        ha-card { width: 100%; }
        .card-header {
          padding: 14px 14px 2px;
          font-size: ${this._config.titleFontSize}px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--primary-text-color);
        }
        .totals {
          display: flex;
          gap: 16px;
          padding: 6px 14px 8px;
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
        ${body}
      </ha-card>
    `;

    this.shadowRoot.querySelector('ha-card').addEventListener('dblclick', () => {
      this._lastFetch = 0;
      if (this._hass) this._fetchData();
    });
  }

  // Dynamische Höhenschätzung statt fixem Wert — sonst passt die von Home
  // Assistant reservierte Fläche in Masonry-/Sections-Dashboards nicht zur
  // tatsächlich gerenderten Höhe (abhängig von Kartenbreite, Titel- und
  // Beschriftungsgröße), was zu Überlappungen oder Lücken führt.
  _estimatedPixelHeight() {
    const px = this._width || 400;
    const lp = this._layoutParams(px);
    const titleFontSize = this._config?.titleFontSize || 14;

    const headerH = 14 + titleFontSize * 1.3;  // Padding + Zeilenhöhe Titel
    const totalsH = 32;                        // Zusammenfassungszeile
    const chartPaddingH = 10;                   // .chart-wrap Padding oben/unten
    const cardPaddingH = 4;                     // ha-card Innenabstand

    return headerH + totalsH + lp.H + chartPaddingH + cardPaddingH;
  }

  getCardSize() {
    return Math.max(1, Math.ceil(this._estimatedPixelHeight() / 50));
  }

  // Für die neueren "Sections"-Dashboards: Grid-Höhe in Reihen (1 Reihe ≈ 56px)
  getGridOptions() {
    const rows = Math.max(3, Math.ceil(this._estimatedPixelHeight() / 56));
    return {
      columns: 12,
      rows,
      min_rows: 3,
    };
  }
}

customElements.define('monthly-bar-card', MonthlyBarCard);

// ── Visueller Config-Editor ──────────────────────────────────────────────
// Nutzt native HA-Formularelemente (<ha-selector>), damit die Eingabemaske
// exakt aussieht wie bei eingebauten Home-Assistant-Cards: Dropdown für den
// Kartentyp, durchsuchbarer Entity-Picker, Text- und Farbfelder.
// Es muss NICHTS per YAML eingetragen werden — alles läuft über diese GUI.

class MonthlyBarCardEditor extends HTMLElement {
  setConfig(config) {
    // WICHTIG: setConfig wird von Home Assistant auch dann erneut aufgerufen,
    // wenn WIR SELBST gerade config-changed gefeuert haben (z.B. bei jedem
    // Tastendruck in einem Textfeld). Würden wir hier jedes Mal das komplette
    // Formular neu bauen (_render mit innerHTML), verliert das aktive Eingabe-
    // feld bei jedem Buchstaben den Fokus/Cursor. Deshalb nur neu rendern,
    // wenn es sich um den allerersten Aufruf handelt oder sich der Kartentyp
    // von außen geändert hat (z.B. durch Undo oder manuelle YAML-Bearbeitung).
    const firstLoad    = !this._config;
    const typeChanged   = !firstLoad && config.card_type !== this._config.card_type;

    this._config = { ...config };

    if (firstLoad || typeChanged) {
      this._render();
    }
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
    // Nur die Preset-Overrides zurücksetzen, damit die Presets des neuen Typs
    // greifen. Das äußere "type"-Feld (custom:monthly-bar-card) und alle
    // sonstigen von Home Assistant verwalteten Schlüssel (z.B. grid_options)
    // MÜSSEN erhalten bleiben — sonst erkennt HA die Karte nicht mehr und
    // fällt auf den rohen YAML-Editor zurück.
    const preserved = { ...this._config };
    delete preserved.entity;
    delete preserved.title;
    delete preserved.color;
    delete preserved.color_prev;
    preserved.card_type = value;

    this._config = preserved;
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

  // Kompaktes, natives Farbfeld (<input type="color">) statt des sehr breiten
  // ha-selector-Farbwählers. effectiveValue ist der tatsächlich wirksame Wert
  // (Override, falls gesetzt, sonst Preset-Default) — damit die Voreinstellung
  // im Feld angezeigt wird statt immer Schwarz. Ein "Zurücksetzen"-Button
  // entfernt einen gesetzten Override wieder, sodass wieder der automatische
  // Standard greift.
  _colorRow(labelText, hintText, field, effectiveValue, isOverridden) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'color-controls';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'color-input';
    input.value = effectiveValue;
    input.addEventListener('input', ev => {
      this._onFieldChange(field, ev.target.value);
      resetBtn.style.visibility = 'visible';
    });
    controls.appendChild(input);

    const hexLabel = document.createElement('span');
    hexLabel.className = 'color-hex';
    hexLabel.textContent = effectiveValue;
    input.addEventListener('input', ev => { hexLabel.textContent = ev.target.value; });
    controls.appendChild(hexLabel);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'color-reset';
    resetBtn.textContent = 'Zurücksetzen';
    resetBtn.style.visibility = isOverridden ? 'visible' : 'hidden';
    resetBtn.addEventListener('click', () => {
      this._onFieldChange(field, null);
      this._render();
    });
    controls.appendChild(resetBtn);

    wrap.appendChild(controls);

    if (hintText) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = hintText;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  // Kompaktes Zahlenfeld für Schriftgrößen (px). isAutoAllowed=true zeigt
  // einen "Automatisch"-Button, der das Feld leert. placeholderText wird
  // angezeigt, wenn das Feld leer ist — macht sichtbar, welche
  // Standard-Schriftgröße dann greift, statt dass das Feld einfach leer wirkt.
  _numberRow(labelText, hintText, field, value, min, max, isAutoAllowed, placeholderText) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'color-controls';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'number-input';
    input.min = min;
    input.max = max;
    if (placeholderText != null) input.placeholder = placeholderText;
    if (value != null) input.value = value;
    input.addEventListener('input', ev => {
      const v = ev.target.value === '' ? null : Number(ev.target.value);
      this._onFieldChange(field, v);
      if (isAutoAllowed) autoBtn.style.visibility = v == null ? 'hidden' : 'visible';
    });
    controls.appendChild(input);

    const unit = document.createElement('span');
    unit.className = 'color-hex';
    unit.textContent = 'px';
    controls.appendChild(unit);

    let autoBtn;
    if (isAutoAllowed) {
      autoBtn = document.createElement('button');
      autoBtn.type = 'button';
      autoBtn.className = 'color-reset';
      autoBtn.textContent = 'Automatisch';
      autoBtn.style.visibility = value != null ? 'visible' : 'hidden';
      autoBtn.addEventListener('click', () => {
        this._onFieldChange(field, null);
        this._render();
      });
      controls.appendChild(autoBtn);
    }

    wrap.appendChild(controls);

    if (hintText) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = hintText;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  // Zwei Formularzeilen nebeneinander statt untereinander anordnen
  _sideBySide(...rows) {
    const wrap = document.createElement('div');
    wrap.className = 'row-pair';
    rows.forEach(row => wrap.appendChild(row));
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
        .color-controls { display: flex; align-items: center; gap: 8px; }
        .color-input {
          width: 40px;
          height: 30px;
          padding: 2px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px;
          cursor: pointer;
          background: none;
          flex-shrink: 0;
        }
        .color-hex {
          font-size: 12px;
          font-family: monospace;
          color: var(--secondary-text-color);
        }
        .color-reset {
          margin-left: auto;
          font-size: 11px;
          color: var(--primary-color, #03a9f4);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 6px;
        }
        .color-reset:hover { text-decoration: underline; }
        .number-input {
          width: 64px;
          padding: 6px 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 14px;
        }
        .row-pair {
          display: flex;
          gap: 16px;
        }
        .row-pair > .editor-row {
          flex: 1;
          min-width: 0;
        }
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

    form.appendChild(this._sideBySide(
      this._numberRow(
        'Schriftgröße Titel',
        'Standard: 14px',
        'title_font_size',
        this._config.title_font_size,
        8, 32, true, '14',
      ),
      this._numberRow(
        'Schriftgröße Beschriftung',
        'Monats-/Achsen-/Wertebeschriftung — Standard: automatisch',
        'label_font_size',
        this._config.label_font_size,
        6, 20, true, 'auto',
      ),
    ));

    form.appendChild(this._colorRow(
      'Farbe (aktuelles Jahr)',
      `Standard für "${preset.label}": ${preset.color}`,
      'color',
      this._config.color ?? preset.color,
      this._config.color != null,
    ));

    form.appendChild(this._colorRow(
      'Farbe (Vorjahr)',
      `Standard: ${preset.colorPrev}`,
      'color_prev',
      this._config.color_prev ?? preset.colorPrev,
      this._config.color_prev != null,
    ));

    form.appendChild(this._colorRow(
      'Farbe (Text/Werte)',
      'Standard: folgt automatisch dem Dashboard-Theme',
      'color_text',
      this._config.color_text ?? '#1c1c1c',
      this._config.color_text != null,
    ));

    form.appendChild(this._colorRow(
      'Farbe (schwächerer Farbton, aktuelles Jahr)',
      'Für vergangene Monate des laufenden Jahres — Standard: automatisch aus Hauptfarbe abgeleitet',
      'color_dim',
      this._config.color_dim ?? (this._config.color ?? preset.color),
      this._config.color_dim != null,
    ));

    form.appendChild(this._row(
      'Darstellung',
      'Automatisch folgt dem Dashboard-Theme; Hell/Dunkel erzwingt feste Farben nur für diese Karte',
      { select: { mode: 'dropdown', options: [
        { value: 'auto',  label: 'Automatisch (Dashboard-Theme)' },
        { value: 'light', label: 'Hell erzwingen' },
        { value: 'dark',  label: 'Dunkel erzwingen' },
      ] } },
      'appearance',
      this._config.appearance || 'auto',
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
