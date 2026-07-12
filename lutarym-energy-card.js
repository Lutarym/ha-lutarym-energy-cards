/**
 * lutarym-energy-card.js
 * Lovelace Custom Card — Monatliche Balkendiagramme (kombiniert)
 * Vereint: Autarkie, Stromverbrauch, PV Ertrag, Wallbox, Wärmepumpe, Klimaanlage
 * Aktuelles Jahr + Vorjahr als Vergleichsbalken
 *
 * YAML:
 *   type: custom:lutarym-energy-card
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
 *   years_back: 1           # optional: 0 | 1 | 2 | 3 — zusätzliche Vorjahre, 0 = nur aktuelles Jahr (Standard: 1)
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

class LutarymEnergyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._seriesYears = [];   // Jahre, älteste zuerst, letztes = aktuelles Jahr
    this._seriesData  = [];   // je Jahr: Array[12] mit Monatswerten
    this._loading   = true;
    this._error     = null;
    this._lastFetch = 0;
    this._width     = 0;
    this._height    = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  connectedCallback() {
    this._ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        const widthChanged  = Math.abs(w - this._width) > 4;
        const heightChanged = Math.abs(h - this._height) > 4;
        if (widthChanged || heightChanged) {
          this._width  = w;
          this._height = h;
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
    const rawYearsBack = config.years_back != null ? Number(config.years_back) : 1;
    const newYearsBack = Math.min(3, Math.max(0, rawYearsBack));
    const entityOrTypeChanged =
      !this._config ||
      this._config.card_type !== cardType ||
      this._config.entity !== newEntity ||
      this._config.yearsBack !== newYearsBack;

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
      yearsBack:  newYearsBack, // 1-3, wie viele Jahre zusätzlich zum aktuellen Jahr angezeigt werden
    };
    this._preset = preset;

    if (entityOrTypeChanged) {
      // Nur bei Typ-, Entity- oder Jahres-Wechsel Daten neu laden (nicht bei
      // jedem Tastendruck in Titel/Farbe im Editor — vermeidet Preview-Flackern).
      this._lastFetch = 0;
      this._seriesYears = [];
      this._seriesData  = [];
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
    return document.createElement('lutarym-energy-card-editor');
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
        {
          name: 'years_back',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: '0', label: 'Nur aktuelles Jahr (kein Vergleich)' },
                { value: '1', label: '1 Jahr zurück (2 Jahre gesamt)' },
                { value: '2', label: '2 Jahre zurück (3 Jahre gesamt)' },
                { value: '3', label: '3 Jahre zurück (4 Jahre gesamt)' },
              ],
            },
          },
        },
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
        years_back: 'Jahre zurück',
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

    const currentYear = new Date().getFullYear();
    const yearsBack    = this._config.yearsBack;
    // älteste zuerst, aktuelles Jahr zuletzt — so werden die Balken von
    // links (ältestes Jahr) nach rechts (aktuelles Jahr) angeordnet.
    const years = [];
    for (let y = currentYear - yearsBack; y <= currentYear; y++) years.push(y);

    try {
      const results = await Promise.all(years.map(y => this._fetchYear(y)));
      this._seriesYears = years;
      this._seriesData  = results;
    } catch (err) {
      console.error('[lutarym-energy-card]', err);
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
             monthStyle: 'initial', barRatio: 0.7 };
    } else if (px < 420) {
      lp = { H: 185, pad: { top: 22, right: 8, bottom: 28, left: 42 },
             monthStyle: 'abbr', barRatio: 0.72 };
    } else if (px < 560) {
      lp = { H: 210, pad: { top: 24, right: 10, bottom: 30, left: 48 },
             monthStyle: 'abbr', barRatio: 0.74 };
    } else {
      lp = { H: 230, pad: { top: 28, right: 14, bottom: 34, left: 54 },
             monthStyle: 'abbr', barRatio: 0.76 };
    }
    return lp;
  }

  // Kontinuierliche Skalierung der Beschriftungsgröße anhand der tatsächlichen
  // Kartenbreite UND -höhe (statt fester Stufen) — Text wächst/schrumpft so
  // flüssig mit, wenn die Karte größer oder kleiner gezogen wird. Eine manuell
  // gesetzte Beschriftungsgröße (label_font_size) überschreibt das weiterhin fest.
  _labelFontSizes(px, H, defaultH) {
    if (this._config.labelFontSize) {
      const f = this._config.labelFontSize;
      return { fMonth: f, fAxis: f, fVal: f };
    }

    const widthScale  = px / 400;
    const heightScale = H / defaultH;
    const scale = Math.min(Math.max(Math.sqrt(widthScale * heightScale), 0.6), 2.2);

    const fMonth = Math.round(9 * scale);
    const fAxis  = Math.round(9 * scale);
    const fVal   = px < 240 ? 0 : Math.round(8 * scale);

    return { fMonth, fAxis, fVal };
  }

  // Höhe von Titel + Summary-Zeile + Chart-Padding — alles außer dem
  // eigentlichen Diagramm. Wird gebraucht, um zu wissen, wie viel von der
  // insgesamt verfügbaren Kartenhöhe für das Diagramm selbst übrig bleibt.
  _nonChartOverhead(px) {
    const titleFontSize = this._config.titleFontSize || 14;
    const headerH = 14 + titleFontSize * 1.3 + 2; // Padding-top + Zeilenhöhe + Padding-bottom
    const showTotal = px === 0 || px >= 280;
    const totalsH = showTotal ? 32 : 0;
    const chartPaddingBottom = 10;
    return headerH + totalsH + chartPaddingBottom;
  }

  // Tatsächliche Chart-Höhe: folgt der vom ResizeObserver gemessenen Karten-
  // höhe (this._height), sobald diese bekannt ist — z.B. wenn die Karte in
  // einem Sections-/Grid-Dashboard höher oder niedriger gezogen wird. Ohne
  // bekannte/externe Höhe (klassisches Masonry-Dashboard) wird weiterhin der
  // responsive Breakpoint-Standardwert verwendet.
  _effectiveChartHeight(defaultH, px) {
    if (!this._height) return defaultH;
    const overhead = this._nonChartOverhead(px);
    const available = this._height - overhead;
    const MIN_CHART_H = 100;
    return Math.max(MIN_CHART_H, Math.round(available));
  }

  // Farbe für eine Jahres-Serie: letzte Serie (aktuelles Jahr) nutzt "color",
  // vorletzte (unmittelbares Vorjahr) nutzt "colorPrev" unverändert, weiter
  // zurückliegende Jahre nutzen zunehmend transparentere Varianten von
  // colorPrev, damit sie sich optisch klar vom Vorjahr abheben.
  _seriesColor(index, total) {
    const isCurrent = index === total - 1;
    if (isCurrent) return this._config.color;
    const distance = total - 1 - index; // 1 = unmittelbares Vorjahr, 2/3 = weiter zurück
    const FADE = { 1: '', 2: 'aa', 3: '77' };
    return this._config.colorPrev + (FADE[distance] ?? '77');
  }

  // Mischt eine Hex-Farbe mit Weiß, um eine blasse Vorschau-/Fallback-Variante
  // zu erzeugen (z.B. für den "schwächerer Farbton"-Vorschauswatch im Editor,
  // da <input type="color"> keine Transparenz darstellen kann).
  static blendWithWhite(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const mix = c => Math.round(c * alpha + 255 * (1 - alpha));
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ── SVG-Chart ─────────────────────────────────────────────────────────

  _buildChart(currentMonth) {
    const MONTHS_ABBR    = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const MONTHS_INITIAL = ['J','F','M','A','M','J','J','A','S','O','N','D'];

    const px = this._width || 400;
    const lp = this._layoutParams(px);
    const { pad, monthStyle, barRatio } = lp;
    const H = this._effectiveChartHeight(lp.H, px);
    const { fMonth, fAxis, fVal } = this._labelFontSizes(px, H, lp.H);

    const W     = px;
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const slotW = plotW / 12;

    const years  = this._seriesYears;
    const series = this._seriesData;
    const N      = Math.max(years.length, 1);
    const lastIndex = N - 1; // Index des aktuellen Jahres (letzte Serie)

    // N Balken pro Monat nebeneinander, mit kleinem Gap dazwischen
    const gap      = slotW * (N > 2 ? 0.035 : 0.06);
    const totalGap = gap * (N - 1);
    const barW     = (slotW * barRatio - totalGap) / N;
    const groupW   = barW * N + totalGap;
    const groupOff = (slotW - groupW) / 2;

    const colorDim  = this._config.colorDim || (this._config.color + '55');
    const colorText = this._config.colorText || 'var(--primary-text-color)';

    // Max-Wert: fest (z.B. Autarkie 0–100%) oder dynamisch über alle Serien
    let maxVal;
    if (this._preset.fixedMax != null) {
      maxVal = this._preset.fixedMax;
    } else {
      const allVals = series.flat().filter(v => v !== null && v >= 0);
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
    for (let m = 0; m < 12; m++) {
      const cx = pad.left + m * slotW + slotW / 2;
      const isFutureMonth = m > currentMonth; // nur relevant für aktuelles Jahr

      for (let s = 0; s < N; s++) {
        const isCurrentSeries = s === lastIndex;
        const val = series[s] ? series[s][m] : null;
        const isFuture = isCurrentSeries && isFutureMonth;
        const xBar = pad.left + m * slotW + groupOff + s * (barW + gap);

        if (isFuture) {
          bars += `<rect x="${xBar.toFixed(1)}" y="${(pad.top + plotH - 3).toFixed(1)}" width="${barW.toFixed(1)}" height="3" fill="var(--divider-color)" rx="1"/>`;
          continue;
        }

        if (val === null) {
          bars += `<rect x="${xBar.toFixed(1)}" y="${(pad.top + plotH - 1).toFixed(1)}" width="${barW.toFixed(1)}" height="1" fill="var(--divider-color)" rx="1"/>`;
          continue;
        }

        const bH = Math.max((val / maxVal) * plotH, 1);
        const bY = pad.top + plotH - bH;
        const isCurrentMonthOfCurrentSeries = isCurrentSeries && m === currentMonth;
        const fill = isCurrentSeries
          ? (isCurrentMonthOfCurrentSeries ? this._config.color : colorDim)
          : this._seriesColor(s, N);
        bars += `<rect x="${xBar.toFixed(1)}" y="${bY.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${fill}" rx="2"/>`;

        // Wertelabel nur für das aktuelle Jahr (sonst zu unübersichtlich bei mehreren Jahren)
        if (isCurrentSeries && fVal > 0 && val > 0) {
          valLabels += `<text x="${(xBar + barW / 2).toFixed(1)}" y="${(bY - 3).toFixed(1)}" text-anchor="middle" font-size="${fVal}" fill="${colorText}">${val.toFixed(0)}${this._preset.valueSuffix}</text>`;
        }
      }

      const label  = monthStyle === 'initial' ? MONTHS_INITIAL[m] : MONTHS_ABBR[m];
      const isCurrentMonth = m === currentMonth;
      const weight = isCurrentMonth ? 'bold' : 'normal';
      const fcolor = isCurrentMonth ? colorText : 'var(--secondary-text-color)';
      xLabels += `<text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="${fMonth}" font-weight="${weight}" fill="${fcolor}">${label}</text>`;
    }

    // Legende: ein Eintrag pro angezeigtem Jahr
    let legend = '';
    if (px >= 280) {
      const ly = pad.top - 6;
      const lx = pad.left + plotW;
      const entryW = N >= 4 ? 44 : 55;
      years.forEach((yr, idx) => {
        const isCurrentSeries = idx === lastIndex;
        const swColor = isCurrentSeries ? this._config.color : this._seriesColor(idx, N);
        const offsetFromRight = (N - idx) * entryW;
        const sx = lx - offsetFromRight;
        legend += `
          <rect x="${sx.toFixed(1)}" y="${(ly - 8).toFixed(1)}" width="10" height="10" fill="${swColor}" rx="2"/>
          <text x="${(sx + 13).toFixed(1)}" y="${(ly + 1).toFixed(1)}" font-size="9" fill="var(--secondary-text-color)">${yr}</text>
        `;
      });
    }

    const unitLabel = `<text x="${(pad.left - 4).toFixed(1)}" y="${(pad.top - 10).toFixed(1)}" text-anchor="middle" font-size="${fAxis}" fill="var(--secondary-text-color)">${this._preset.unit}</text>`;
    const axes = `
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
    `;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;display:block;">
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
    const currentMonth = now.getMonth();
    const years        = this._seriesYears;
    const lastIndex    = years.length - 1;
    const px           = this._width || 0;

    let body;
    if (this._loading) {
      body = `<div class="loading">Lade Daten…</div>`;
    } else if (this._error) {
      body = `<div class="error">Fehler: ${this._error}</div>`;
    } else {
      const showTotal = px === 0 || px >= 280;
      const totalsItems = years.map((yr, idx) => {
        const isCurrentSeries = idx === lastIndex;
        const dotColor = isCurrentSeries ? this._config.color : this._seriesColor(idx, years.length);
        const sum = this._summary(this._seriesData[idx] || []);
        return `<span class="tot-item"><span class="dot" style="background:${dotColor}"></span>${yr}: <strong>${this._formatSummary(sum)}</strong></span>`;
      }).join('');
      body = `
        ${showTotal ? `<div class="totals">${totalsItems}</div>` : ''}
        <div class="chart-wrap">${this._buildChart(currentMonth)}</div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          ${this._appearanceCSSVars()}
        }
        ha-card {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .card-header {
          padding: 14px 14px 2px;
          font-size: ${this._config.titleFontSize}px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--primary-text-color);
          flex-shrink: 0;
        }
        .totals {
          display: flex;
          gap: 16px;
          padding: 6px 14px 8px;
          font-size: 12px;
          color: var(--secondary-text-color);
          flex-shrink: 0;
        }
        .tot-item { display: flex; align-items: center; gap: 5px; }
        .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
        .chart-wrap {
          padding: 0 6px 10px;
          flex: 1 1 auto;
          min-height: 0;
        }
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
    return this._nonChartOverhead(px) + lp.H;
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

customElements.define('lutarym-energy-card', LutarymEnergyCard);

// ── Visueller Config-Editor ──────────────────────────────────────────────
// Nutzt native HA-Formularelemente (<ha-selector>), damit die Eingabemaske
// exakt aussieht wie bei eingebauten Home-Assistant-Cards: Dropdown für den
// Kartentyp, durchsuchbarer Entity-Picker, Text- und Farbfelder.
// Es muss NICHTS per YAML eingetragen werden — alles läuft über diese GUI.

class LutarymEnergyCardEditor extends HTMLElement {
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
    // greifen. Das äußere "type"-Feld (custom:lutarym-energy-card) und alle
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

    let control;
    if (selectorObj.select) {
      // Natives <select> statt <ha-selector> für Dropdowns: ha-selector wird
      // von Home Assistant asynchron nachgeladen — wird der Editor sehr früh
      // erzeugt (bevor die Komponente registriert ist), gehen Klicks/Werte
      // gelegentlich verloren ("Dropdown reagiert falsch"). Natives <select>
      // funktioniert immer zuverlässig, unabhängig vom Ladezeitpunkt.
      control = document.createElement('select');
      control.className = 'native-select';
      (selectorObj.select.options || []).forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (String(opt.value) === String(value)) optionEl.selected = true;
        control.appendChild(optionEl);
      });
      control.addEventListener('change', ev => {
        const newVal = ev.target.value;
        if (field === 'card_type') {
          this._onTypeChange(newVal);
        } else {
          this._onFieldChange(field, newVal);
        }
      });
    } else {
      control = document.createElement('ha-selector');
      control.hass = this._hass;
      control.selector = selectorObj;
      control.value = value ?? '';
      control.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        const newVal = ev.detail.value;
        this._onFieldChange(field, newVal);
      });
    }
    wrap.appendChild(control);

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
        .native-select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 14px;
          box-sizing: border-box;
          cursor: pointer;
        }
        .row-pair {
          display: flex;
          gap: 16px;
        }
        .row-pair > .editor-row {
          flex: 1;
          min-width: 0;
        }
        .section-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--secondary-text-color);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 12px;
          margin-top: 4px;
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

    form.appendChild(this._row(
      'Jahre zurück',
      'Wie viele vergangene Jahre zusätzlich zum aktuellen Jahr angezeigt werden',
      { select: { mode: 'dropdown', options: [
        { value: '0', label: 'Nur aktuelles Jahr (kein Vergleich)' },
        { value: '1', label: '1 Jahr zurück (2 Jahre gesamt)' },
        { value: '2', label: '2 Jahre zurück (3 Jahre gesamt)' },
        { value: '3', label: '3 Jahre zurück (4 Jahre gesamt)' },
      ] } },
      'years_back',
      String(this._config.years_back ?? 1),
    ));

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'section-label';
    sectionLabel.textContent = 'Farben';
    form.appendChild(sectionLabel);

    const effectiveColor = this._config.color ?? preset.color;
    // Vorschau des "schwächeren Farbtons" als geblendete Vollfarbe, da ein
    // natives <input type="color"> keine Transparenz darstellen kann — sonst
    // wirkt der Standard-Vorschauwert wie die normale Hauptfarbe und nicht
    // wie der tatsächlich im Chart genutzte, abgeschwächte Farbton.
    const effectiveDim = this._config.color_dim ?? LutarymEnergyCard.blendWithWhite(effectiveColor, 0x55 / 255);

    form.appendChild(this._sideBySide(
      this._colorRow(
        'Aktuelles Jahr',
        `Standard für "${preset.label}": ${preset.color}`,
        'color',
        effectiveColor,
        this._config.color != null,
      ),
      this._colorRow(
        'Vorjahr(e)',
        `Standard: ${preset.colorPrev}`,
        'color_prev',
        this._config.color_prev ?? preset.colorPrev,
        this._config.color_prev != null,
      ),
    ));

    form.appendChild(this._sideBySide(
      this._colorRow(
        'Text / Werte',
        'Standard: folgt Dashboard-Theme',
        'color_text',
        this._config.color_text ?? '#1c1c1c',
        this._config.color_text != null,
      ),
      this._colorRow(
        'Schwächerer Farbton',
        'Vergangene Monate, aktuelles Jahr — Standard: automatisch aus Hauptfarbe',
        'color_dim',
        effectiveDim,
        this._config.color_dim != null,
      ),
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

customElements.define('lutarym-energy-card-editor', LutarymEnergyCardEditor);

// ── Registrierung bei HACS / "Karte hinzufügen"-Dialog ──────────────────

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lutarym-energy-card',
  name: 'Energy Card by Lutarym',
  description: 'Monatliches Balkendiagramm (Autarkie, Stromverbrauch, PV, Wallbox, Wärmepumpe, Klimaanlage) — aktuelles Jahr vs. Vorjahre.',
});
