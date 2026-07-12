/**
 * lutarym-ha-cards.js
 * Gebündelte Lovelace Custom Cards von Lutarym für Home Assistant.
 * Enthält 5 eigenständige Cards, jede mit eigenem Custom-Element-Typ und
 * eigenem visuellen Editor. Als EINE Datei gebündelt, damit HACS
 * (Dashboard/Plugin-Kategorie ist auf eine Datei pro Repo ausgelegt)
 * zuverlässig alles in einem Rutsch lädt.
 *
 *  1. custom:lutarym-energy-card      — Energy Card by Lutarym
 *  2. custom:strom-uebersicht-card    — Strom-Übersicht by Lutarym
 *  3. custom:raum-energie-card        — Raum-Energie by Lutarym
 *  4. custom:wallbox-card             — Wallbox by Lutarym
 *  5. custom:battery-card             — BYD Battery by Lutarym
 *
 * Siehe README.md im Repository für die vollständige Konfiguration jeder Card.
 */

// ════════════════════════════════════════════════════════════════
// 1. ENERGY CARD BY LUTARYM (custom:lutarym-energy-card)
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// 2. STROM-ÜBERSICHT BY LUTARYM (custom:strom-uebersicht-card)
// ════════════════════════════════════════════════════════════════

/**
 * Strom-Uebersicht Card fuer Home Assistant (Lovelace)
 *
 * Logik: Zaehlerstand(heute) - Zaehlerstand(1.1.) = Jahresverbrauch
 *        Gibt es keinen Stand am 1.1. (z.B. Sensor erst spaeter eingebaut),
 *        wird 0 als Startwert angenommen, d.h. der erste bekannte Stand
 *        ist gleichzeitig der Verbrauch seit Einbau.
 *
 * INSTALLATION
 *   1. Datei nach /config/www/strom-uebersicht-card.js kopieren
 *   2. Einstellungen > Dashboards > Ressourcen > Ressource hinzufuegen:
 *        URL:  /local/strom-uebersicht-card.js
 *        Typ:  JavaScript-Modul
 *   3. Browser-Cache leeren (Strg+F5)
 *
 * KONFIGURATION
 *   type: custom:strom-uebersicht-card
 *   energy_entity: sensor.haus_strom_energie   # PFLICHT
 *   price_per_kwh: 0.32                         # PFLICHT (Euro/kWh; im visuellen Editor als Cent/kWh eingebbar)
 *   base_fee_yearly: 150                        # optional: Jahres-Grundgebuehr EUR
 *   base_fee_monthly: 12.5                      # optional: alternativ monatlich EUR
 *   base_fee_mode: accrued                      # "accrued" = tagesanteilig (Default)
 *                                               # "full"    = volle Jahresgrundgebuehr
 *   currency: EUR                               # optional (Default: EUR)
 *   show_forecast: false                        # optional: Hochrechnung Jahresende
 *   title: Stromuebersicht                      # optional
 */

class StromUebersichtCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass    = null;
    this._config  = null;
    this._el      = null;
    this._data    = null;
    this._loading = false;
    this._interval = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config) this._load();
    else this._render();
  }

  setConfig(config) {
    if (!config || !config.energy_entity)
      throw new Error('Pflichtfeld "energy_entity" fehlt.');
    if (config.price_per_kwh === undefined || config.price_per_kwh === null)
      throw new Error('Pflichtfeld "price_per_kwh" fehlt.');
    this._config = config;
    this._data   = null;
    this._build();
    this._render();
    if (this._hass) this._load();
  }

  getCardSize() { return 4; }

  static getConfigElement() {
    return document.createElement('strom-uebersicht-card-editor');
  }

  connectedCallback() {
    if (this._hass && this._config && !this._data) this._load();
    this._interval = window.setInterval(() => this._load(), 15 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this._interval) { window.clearInterval(this._interval); this._interval = null; }
  }

  // ---- Daten laden ----------------------------------------------------

  async _load() {
    if (!this._hass || !this._config) return;
    if (this._loading) return;
    this._loading = true;

    const entity  = this._config.energy_entity;
    const now     = new Date();
    const year    = now.getFullYear();

    // Jahresgrenzen
    const jan1Cur  = new Date(year,     0, 1, 0, 0, 0, 0);  // 1.1. dieses Jahr
    const jan1Prev = new Date(year - 1, 0, 1, 0, 0, 0, 0);  // 1.1. Vorjahr
    const jan1Next = new Date(year + 1, 0, 1, 0, 0, 0, 0);  // 1.1. naechstes Jahr (Vorjahr-Ende)

    try {
      // Einen grossen Block laden: komplettes Vorjahr + aktuelles Jahr bis jetzt.
      // Periode "day" liefert den sum-Stand am Ende jedes Tages.
      const result = await this._hass.callWS({
        type:          'recorder/statistics_during_period',
        start_time:    jan1Prev.toISOString(),
        end_time:      now.toISOString(),
        statistic_ids: [entity],
        period:        'day',
        types:         ['sum'],
      });

      const points = (result && result[entity]) ? result[entity] : [];

      // Hilfsfunktion: naechsten sum-Wert ab einem Zeitpunkt t finden.
      // Gibt { sum, t } des fruehesten Punktes >= t zurueck, oder null.
      const firstSumFrom = (t) => {
        let best = null;
        for (const p of points) {
          if (typeof p.sum !== 'number') continue;
          const pt = new Date(p.start).getTime();
          if (pt >= t && (best === null || pt < best.t)) best = { sum: p.sum, t: pt };
        }
        return best;
      };

      // Letzten sum-Wert vor oder am Zeitpunkt t finden.
      const lastSumBefore = (t) => {
        let best = null;
        for (const p of points) {
          if (typeof p.sum !== 'number') continue;
          const pt = new Date(p.start).getTime();
          if (pt <= t && (best === null || pt > best.t)) best = { sum: p.sum, t: pt };
        }
        return best;
      };

      // Aktueller Zählerstand = letzter bekannter Punkt
      const latestPoint = lastSumBefore(now.getTime());
      if (!latestPoint) {
        this._data = { error: 'Noch keine Statistikdaten vorhanden.' };
        return;
      }
      const sumNow = latestPoint.sum;

      // Zählerstand am 1.1. dieses Jahres: letzter Punkt vor jan1Cur.
      // Falls keiner vorhanden (Sensor nach dem 1.1. eingebaut), Startwert = 0.
      const startCurPoint = lastSumBefore(jan1Cur.getTime());
      const sumStartCur   = startCurPoint ? startCurPoint.sum : 0;

      const current = sumNow - sumStartCur;

      // Vorjahr: Zählerstand 1.1.Vorjahr und 1.1.diesesJahres
      // Falls kein Punkt am 1.1.Vorjahr vorhanden (Sensor noch nicht vorhanden), Vorjahr = null.
      const startPrevPoint = lastSumBefore(jan1Prev.getTime());
      const endPrevPoint   = lastSumBefore(jan1Cur.getTime());
      let previous = null;
      if (startPrevPoint && endPrevPoint && endPrevPoint.sum > startPrevPoint.sum) {
        previous = endPrevPoint.sum - startPrevPoint.sum;
      }

      // Manueller Vorjahreswert aus Config hat Vorrang
      const manualPrev = (this._config.previous_year_kwh != null)
        ? Number(this._config.previous_year_kwh) : null;

      this._data = { current: Math.max(0, current), previous: manualPrev ?? previous };

    } catch (e) {
      this._data = { error: 'WebSocket-Fehler: ' + e.message };
    } finally {
      this._loading = false;
      this._render();
    }
  }

  // ---- Hilfsrechner ---------------------------------------------------

  _yearFraction() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end   = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
    return (now - start) / (end - start);
  }

  _fmt(v, minD, maxD) {
    return Number(v).toLocaleString('de-DE', {
      minimumFractionDigits: minD,
      maximumFractionDigits: maxD ?? minD,
    });
  }

  // ---- DOM aufbauen ---------------------------------------------------

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px 18px; box-sizing: border-box; }
        .title {
          font-size: .95rem; font-weight: 500; letter-spacing: .03em;
          text-transform: uppercase; color: var(--secondary-text-color); margin-bottom: 14px;
        }
        .hero-value {
          font-size: 2.4rem; font-weight: 600; line-height: 1.05;
          color: var(--primary-text-color); font-variant-numeric: tabular-nums;
        }
        .hero-label { font-size: .8rem; color: var(--secondary-text-color); margin-top: 3px; }
        .breakdown  { margin-top: 14px; }
        .row {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 12px; padding: 3px 0; font-size: .9rem;
        }
        .row .label { color: var(--secondary-text-color); }
        .row .value { color: var(--primary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .divider { height: 1px; background: var(--divider-color, rgba(128,128,128,.2)); margin: 14px 0; }
        .consumption-block { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
        .col.right { text-align: right; }
        .sub-label  { font-size: .75rem; color: var(--secondary-text-color); margin-bottom: 2px; }
        .cons-value { font-size: 1.55rem; font-weight: 600; color: var(--primary-text-color); font-variant-numeric: tabular-nums; line-height: 1.1; }
        .cons-value.secondary { font-size: 1.05rem; font-weight: 500; color: var(--secondary-text-color); }
        .compare-row { margin-top: 8px; }
        .compare { font-size: .9rem; font-weight: 600; font-variant-numeric: tabular-nums; }
        .compare.down { color: var(--success-color, #2e7d32); }
        .compare.up   { color: var(--error-color, #c62828); }
        .note { font-size: .75rem; color: var(--secondary-text-color); margin-top: 6px; font-style: italic; }
        .forecast-row {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 12px; margin-top: 12px; padding-top: 12px;
          border-top: 1px solid var(--divider-color, rgba(128,128,128,.2)); font-size: .85rem;
        }
        .forecast-row .label { color: var(--secondary-text-color); }
        .forecast-row .value { color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
      </style>
      <ha-card>
        <div class="title"      id="title"></div>
        <div class="hero-value" id="cost-total"></div>
        <div class="hero-label" id="cost-label"></div>
        <div class="breakdown">
          <div class="row">
            <span class="label" id="energy-label"></span>
            <span class="value" id="cost-energy"></span>
          </div>
          <div class="row" id="row-base">
            <span class="label" id="base-label">Grundgebuehr</span>
            <span class="value" id="cost-base"></span>
          </div>
        </div>
        <div class="divider"></div>
        <div class="consumption-block">
          <div class="col">
            <div class="sub-label"  id="cons-label"></div>
            <div class="cons-value" id="cons-current"></div>
          </div>
          <div class="col right" id="prev-wrap">
            <div class="sub-label"           id="prev-label"></div>
            <div class="cons-value secondary" id="cons-prev"></div>
          </div>
        </div>
        <div class="compare-row" id="row-compare">
          <span class="compare" id="compare"></span>
        </div>
        <div class="note" id="note-partial"></div>
        <div class="forecast-row" id="row-forecast">
          <span class="label">Prognose Jahresende (linear)</span>
          <span class="value" id="forecast"></span>
        </div>
      </ha-card>`;

    const $ = id => this.shadowRoot.getElementById(id);
    this._el = {
      title: $('title'), costTotal: $('cost-total'), costLabel: $('cost-label'),
      energyLabel: $('energy-label'), costEnergy: $('cost-energy'),
      rowBase: $('row-base'), baseLabel: $('base-label'), costBase: $('cost-base'),
      consLabel: $('cons-label'), consCurrent: $('cons-current'),
      prevWrap: $('prev-wrap'), prevLabel: $('prev-label'), consPrev: $('cons-prev'),
      rowCompare: $('row-compare'), compare: $('compare'),
      notePartial: $('note-partial'),
      rowForecast: $('row-forecast'), forecast: $('forecast'),
    };
  }

  // ---- Rendern --------------------------------------------------------

  _render() {
    if (!this._el || !this._config) return;
    const el       = this._el;
    const cfg      = this._config;
    const data     = this._data;
    const currency = cfg.currency || 'EUR';
    const year     = new Date().getFullYear();

    el.title.textContent = cfg.title || 'Stromübersicht';

    if (!data) {
      el.costTotal.textContent    = '…';
      el.costLabel.textContent    = 'Lade Daten';
      el.costEnergy.textContent   = '';
      el.rowBase.style.display    = 'none';
      el.consCurrent.textContent  = '…';
      el.prevWrap.style.display   = 'none';
      el.rowCompare.style.display = 'none';
      el.notePartial.textContent  = '';
      el.rowForecast.style.display = 'none';
      return;
    }
    if (data.error) {
      el.costTotal.textContent    = '!';
      el.costLabel.textContent    = data.error;
      el.costEnergy.textContent   = '';
      el.rowBase.style.display    = 'none';
      el.consCurrent.textContent  = '';
      el.prevWrap.style.display   = 'none';
      el.rowCompare.style.display = 'none';
      el.notePartial.textContent  = '';
      el.rowForecast.style.display = 'none';
      return;
    }

    const { current, previous, partialYear } = data;
    const price    = Number(cfg.price_per_kwh);
    const fraction = this._yearFraction();

    let baseFeeYearly = 0;
    if      (cfg.base_fee_yearly  != null) baseFeeYearly = Number(cfg.base_fee_yearly);
    else if (cfg.base_fee_monthly != null) baseFeeYearly = Number(cfg.base_fee_monthly) * 12;
    const baseFee = (cfg.base_fee_mode === 'full') ? baseFeeYearly : baseFeeYearly * fraction;

    const energyCost = current * price;
    const totalCost  = energyCost + baseFee;

    el.costTotal.textContent  = this._fmt(totalCost, 2) + ' ' + currency;
    el.costLabel.textContent  = 'Stromkosten ' + year + ' bisher';

    el.energyLabel.textContent = 'Energie ('
      + this._fmt(current, 0, 1) + ' kWh × '
      + this._fmt(price, 2, 4)   + ' ' + currency + ')';
    el.costEnergy.textContent = this._fmt(energyCost, 2) + ' ' + currency;

    if (baseFeeYearly > 0) {
      el.rowBase.style.display = '';
      el.baseLabel.textContent = (cfg.base_fee_mode === 'full') ? 'Grundgebühr (Jahr)' : 'Grundgebühr (anteilig)';
      el.costBase.textContent  = this._fmt(baseFee, 2) + ' ' + currency;
    } else {
      el.rowBase.style.display = 'none';
    }

    el.consLabel.textContent   = 'Verbrauch ' + year;
    el.consCurrent.textContent = this._fmt(current, 0, 1) + ' kWh';

    // Hinweis wenn Sensor erst im Laufe des Jahres eingebaut wurde
    el.notePartial.textContent = partialYear
      ? 'Sensor nicht seit 1.1. vorhanden, Verbrauch ab Einbau.' : '';

    el.prevWrap.style.display = '';
    el.prevLabel.textContent  = 'Vorjahr ' + (year - 1);
    if (previous !== null && previous > 0) {
      el.consPrev.textContent     = this._fmt(previous, 0, 1) + ' kWh';
      const diff = current - previous;
      const pct  = (diff / previous) * 100;
      const less = diff < 0;
      el.compare.className   = 'compare ' + (less ? 'down' : 'up');
      el.compare.textContent = (less ? '▼' : '▲') + ' '
        + this._fmt(Math.abs(pct), 1) + ' % ' + (less ? 'weniger' : 'mehr')
        + ' (' + this._fmt(Math.abs(diff), 0, 1) + ' kWh)';
      el.rowCompare.style.display = '';
    } else {
      el.consPrev.textContent     = '–';
      el.compare.className        = 'compare';
      el.compare.textContent      = 'Keine Daten für ' + (year - 1);
      el.rowCompare.style.display = '';
    }

    if (cfg.show_forecast && fraction > 0) {
      el.forecast.textContent      = this._fmt(current / fraction, 0, 1) + ' kWh';
      el.rowForecast.style.display = '';
    } else {
      el.rowForecast.style.display = 'none';
    }
  }
}

StromUebersichtCard.getStubConfig = () => ({
  title: 'Stromübersicht',
  energy_entity: 'sensor.haus_strom_energie',
  price_per_kwh: 0.32,
  base_fee_yearly: 150,
});

// ── Visueller Config-Editor ──────────────────────────────────────────────

class StromUebersichtCardEditor extends HTMLElement {
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
    const l = document.createElement('label');
    l.textContent = label;
    wrap.appendChild(l);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', ev => this._onChange(field, ev.target.value));
    wrap.appendChild(input);
    return wrap;
  }

  _numberRow(label, field, value, placeholder, step) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const l = document.createElement('label');
    l.textContent = label;
    wrap.appendChild(l);
    const input = document.createElement('input');
    input.type = 'number';
    if (step) input.step = step;
    if (value != null) input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', ev => this._onChange(field, ev.target.value, true));
    wrap.appendChild(input);
    return wrap;
  }

  _entityRow(label, field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    const l = document.createElement('label');
    l.textContent = label;
    wrap.appendChild(l);
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
    const l = document.createElement('label');
    l.textContent = label;
    wrap.appendChild(l);
    const select = document.createElement('select');
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', ev => this._onChange(field, ev.target.value));
    wrap.appendChild(select);
    return wrap;
  }

  _checkboxRow(label, field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'row checkbox-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', ev => this._onChange(field, ev.target.checked ? true : null));
    wrap.appendChild(input);
    wrap.appendChild(l);
    return wrap;
  }

  _priceRow(label, field, valueEuro, placeholderCt, hintText) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    if (valueEuro != null && valueEuro !== '') {
      input.value = +(Number(valueEuro) * 100).toFixed(4); // Euro -> Cent für die Anzeige
    }
    if (placeholderCt) input.placeholder = placeholderCt;
    input.addEventListener('change', ev => {
      const ct = ev.target.value;
      if (ct === '') {
        delete this._config[field];
      } else {
        this._config[field] = Number(ct) / 100; // Cent -> Euro für die Speicherung
      }
      this._fireChanged();
    });
    wrap.appendChild(input);
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
        .hint { font-size: 11px; color: var(--secondary-text-color); margin-top: -8px; }
      </style>
      <div class="form"></div>
    `;
    const form = this.querySelector('.form');

    form.appendChild(this._textRow('Titel', 'title', cfg.title, 'Stromübersicht'));
    form.appendChild(this._entityRow('Energie-Entity (Pflicht)', 'energy_entity', cfg.energy_entity));
    form.appendChild(this._priceRow('Preis pro kWh (Pflicht)', 'price_per_kwh', cfg.price_per_kwh, '32,50', 'Eingabe in Cent pro kWh (ct/kWh) — wird intern in Euro gespeichert.'));
    form.appendChild(this._numberRow('Grundgebühr jährlich (EUR)', 'base_fee_yearly', cfg.base_fee_yearly, 'z.B. 150', '0.01'));
    form.appendChild(this._numberRow('Grundgebühr monatlich (EUR, Alternative)', 'base_fee_monthly', cfg.base_fee_monthly, 'z.B. 12.50', '0.01'));
    {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Nur eines von beidem ausfüllen — jährlich hat Vorrang, falls beide gesetzt sind.';
      form.appendChild(hint);
    }
    form.appendChild(this._selectRow('Grundgebühr-Modus', 'base_fee_mode', cfg.base_fee_mode || 'accrued', [
      { value: 'accrued', label: 'Tagesanteilig' },
      { value: 'full', label: 'Volle Jahresgebühr' },
    ]));
    form.appendChild(this._textRow('Währung', 'currency', cfg.currency, 'EUR'));
    form.appendChild(this._numberRow('Manueller Vorjahreswert (kWh)', 'previous_year_kwh', cfg.previous_year_kwh, 'optional'));
    {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Der Vorjahresverbrauch wird automatisch aus der Entity-Statistik berechnet (1.1.–31.12. Vorjahr), sofern für den Zeitraum Daten vorhanden sind. Leer lassen für automatische Berechnung — nur bei fehlenden/unvollständigen historischen Daten manuell überschreiben.';
      form.appendChild(hint);
    }
    form.appendChild(this._checkboxRow('Hochrechnung Jahresende anzeigen', 'show_forecast', cfg.show_forecast));
  }
}

customElements.define('strom-uebersicht-card-editor', StromUebersichtCardEditor);

customElements.define('strom-uebersicht-card', StromUebersichtCard);



window.customCards = window.customCards || [];
window.customCards.push({
  type: 'strom-uebersicht-card',
  name: 'Strom-Übersicht by Lutarym',
  description: 'Jahresverbrauch per Zählerstand-Differenz, Vorjahresvergleich, Kosten inkl. Grundgebühr.',
});

console.info(
  '%c STROM-UEBERSICHT-CARD %c v4.0.0 ',
  'color:white;background:#03a9f4;font-weight:700;border-radius:3px 0 0 3px;',
  'color:#03a9f4;background:white;font-weight:700;border-radius:0 3px 3px 0;'
);

// ════════════════════════════════════════════════════════════════
// 3. RAUM-ENERGIE BY LUTARYM (custom:raum-energie-card)
// ════════════════════════════════════════════════════════════════

/**
 * Raum Energie Card fuer Home Assistant (Lovelace)
 *
 * Zeigt den Jahresverbrauch des Gesamthauses und der einzelnen Raeume.
 * Berechnung: Zaehlerstand(heute) - Zaehlerstand(1.1.) = Jahresverbrauch
 * Kein Stand am 1.1. vorhanden = Startwert 0.
 * Jeder Raum bekommt seinen prozentualen Anteil am Gesamtverbrauch.
 *
 * INSTALLATION
 *   1. Datei nach /config/www/raum-energie-card.js kopieren
 *   2. Einstellungen > Dashboards > Ressourcen > Ressource hinzufuegen:
 *        URL:  /local/raum-energie-card.js
 *        Typ:  JavaScript-Modul
 *   3. Browser-Cache leeren (Strg+F5)
 *
 * KONFIGURATION
 *   type: custom:raum-energie-card
 *   title: Stromverbrauch Raeume             # optional
 *   total_entity: sensor.haus_strom_energie  # PFLICHT: Gesamt-kWh-Zaehler
 *   rooms:                                   # PFLICHT: 1-10 Raeume
 *     - name: Wohnzimmer
 *       entity: sensor.wohnzimmer_energie_kwh
 *     - name: Kueche
 *       entity: sensor.kueche_energie_kwh
 *     - name: Buero
 *       entity: sensor.buero_energie_kwh
 */

class RaumEnergieCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass    = null;
    this._config  = null;
    this._el      = null;
    this._data    = null;
    this._loading = false;
    this._interval = null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config) this._load();
    else this._render();
  }

  setConfig(config) {
    if (!config || !config.total_entity)
      throw new Error('Pflichtfeld "total_entity" fehlt.');
    if (!config.rooms || !Array.isArray(config.rooms) || config.rooms.length === 0)
      throw new Error('Pflichtfeld "rooms" fehlt oder leer.');
    if (config.rooms.length > 10)
      throw new Error('Maximal 10 Raeume erlaubt.');
    for (const r of config.rooms) {
      if (!r.name || !r.entity)
        throw new Error('Jeder Raum braucht "name" und "entity".');
    }
    this._config = config;
    this._data   = null;
    this._build();
    this._render();
    if (this._hass) this._load();
  }

  getCardSize() {
    return this._config ? 2 + this._config.rooms.length : 4;
  }

  static getConfigElement() {
    return document.createElement('raum-energie-card-editor');
  }


  connectedCallback() {
    if (this._hass && this._config && !this._data) this._load();
    this._interval = window.setInterval(() => this._load(), 15 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this._interval) { window.clearInterval(this._interval); this._interval = null; }
  }

  // ---- Jahresverbrauch aus Statistik holen ----------------------------

  async _yearKwh(entity) {
    const now  = new Date();
    const year = now.getFullYear();

    const result = await this._hass.callWS({
      type:          'recorder/statistics_during_period',
      start_time:    new Date(year, 0, 1).toISOString(),
      end_time:      new Date(year + 1, 0, 1).toISOString(),
      statistic_ids: [entity],
      period:        'month',
      units:         { energy: 'kWh' },
      types:         ['change'],
    });

    const points = result?.[entity] ?? [];
    if (points.length === 0) return null;

    // Monatliche Deltas aufsummieren (identische Methode wie monthly-energy-bar-card)
    const total = points.reduce((acc, p) => {
      const v = p.change;
      return acc + (typeof v === 'number' && v >= 0 ? v : 0);
    }, 0);

    return total > 0 ? total : null;
  }

  // ---- Daten laden ----------------------------------------------------

  async _load() {
    if (!this._hass || !this._config) return;
    if (this._loading) return;
    this._loading = true;

    try {
      const entities = [this._config.total_entity, ...this._config.rooms.map(r => r.entity)];
      const results  = await Promise.all(entities.map(e => this._yearKwh(e)));

      const total = results[0];
      const rooms = this._config.rooms.map((r, i) => ({
        name:  r.name,
        kwh:   results[i + 1],
      }));

      this._data = { total, rooms };
    } catch (e) {
      this._data = { error: 'WebSocket-Fehler: ' + e.message };
    } finally {
      this._loading = false;
      this._render();
    }
  }

  // ---- Hilfsrechner ---------------------------------------------------

  _fmt(v, minD, maxD) {
    return Number(v).toLocaleString('de-DE', {
      minimumFractionDigits: minD,
      maximumFractionDigits: maxD ?? minD,
    });
  }

  // ---- DOM aufbauen ---------------------------------------------------

  _build() {
    const rooms = this._config.rooms;
    const year  = new Date().getFullYear();

    const roomRows = rooms.map((r, i) => `
      <div class="room-row" id="room-${i}">
        <div class="room-name-cell">
          <span class="room-name">${r.name}</span>
          ${r.power_entity ? `<span class="room-watt" id="watt-${i}"></span>` : ''}
        </div>
        <div class="room-bar-wrap">
          <div class="room-bar" id="bar-${i}"></div>
        </div>
        <div class="room-kwh"  id="kwh-${i}"></div>
        <div class="room-pct"  id="pct-${i}"></div>
      </div>`).join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px 18px; box-sizing: border-box; }

        .title {
          font-size: .95rem; font-weight: 500; letter-spacing: .03em;
          text-transform: uppercase; color: var(--secondary-text-color); margin-bottom: 14px;
        }

        .total-block { margin-bottom: 16px; }
        .total-label { font-size: .78rem; color: var(--secondary-text-color); margin-bottom: 2px; }
        .total-value {
          font-size: 2.2rem; font-weight: 600; line-height: 1.05;
          color: var(--primary-text-color); font-variant-numeric: tabular-nums;
        }
        .total-unit { font-size: .8rem; color: var(--secondary-text-color); margin-left: 4px; }

        .divider { height: 1px; background: var(--divider-color, rgba(128,128,128,.2)); margin: 0 0 14px; }

        .room-row {
          display: grid;
          grid-template-columns: 1fr 1fr auto auto;
          align-items: center;
          gap: 8px;
          padding: 5px 0;
          border-bottom: 1px solid var(--divider-color, rgba(128,128,128,.1));
        }
        .room-row:last-child { border-bottom: none; }

        .room-name-cell {
          display: flex; flex-direction: column; gap: 1px;
          overflow: hidden;
        }
        .room-name {
          font-size: .9rem; color: var(--primary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .room-watt {
          font-size: .75rem; color: var(--primary-color, #03a9f4);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .room-bar-wrap {
          height: 6px; background: var(--divider-color, rgba(128,128,128,.2));
          border-radius: 3px; overflow: hidden;
        }
        .room-bar {
          height: 100%; border-radius: 3px;
          background: var(--primary-color, #03a9f4);
          transition: width .4s ease;
          width: 0%;
        }
        .sonstige-bar {
          background: var(--secondary-text-color);
          opacity: 0.5;
        }
        .room-row.sonstige {
          border-top: 1px solid var(--divider-color, rgba(128,128,128,.2));
          margin-top: 4px;
          padding-top: 8px;
          border-bottom: none;
        }
        .room-row.sonstige .room-name {
          font-style: italic;
          color: var(--secondary-text-color);
        }
        .room-kwh {
          font-size: .88rem; font-variant-numeric: tabular-nums;
          color: var(--primary-text-color); white-space: nowrap; text-align: right;
          min-width: 70px;
        }
        .room-pct {
          font-size: .8rem; color: var(--secondary-text-color);
          white-space: nowrap; text-align: right; min-width: 40px;
        }
      </style>
      <ha-card>
        <div class="title" id="title"></div>
        <div class="total-block">
          <div class="total-label" id="total-label">Gesamtverbrauch ${year}</div>
          <div>
            <span class="total-value" id="total-value"></span>
            <span class="total-unit">kWh</span>
          </div>
        </div>
        <div class="divider"></div>
        ${roomRows}
        <div class="room-row sonstige">
          <div class="room-name">Sonstige</div>
          <div class="room-bar-wrap">
            <div class="room-bar sonstige-bar" id="bar-sonstige"></div>
          </div>
          <div class="room-kwh" id="kwh-sonstige"></div>
          <div class="room-pct" id="pct-sonstige"></div>
        </div>
      </ha-card>`;

    const $ = id => this.shadowRoot.getElementById(id);
    this._el = {
      title:      $('title'),
      totalLabel: $('total-label'),
      totalValue: $('total-value'),
      rooms: rooms.map((r, i) => ({
        kwh:  $(`kwh-${i}`),
        pct:  $(`pct-${i}`),
        bar:  $(`bar-${i}`),
        watt: r.power_entity ? $(`watt-${i}`) : null,
        power_entity: r.power_entity || null,
      })),
      sonstige: {
        kwh: $('kwh-sonstige'),
        pct: $('pct-sonstige'),
        bar: $('bar-sonstige'),
      },
    };
  }

  // ---- Rendern --------------------------------------------------------

  _render() {
    if (!this._el || !this._config) return;
    const el   = this._el;
    const data = this._data;
    const year = new Date().getFullYear();

    el.title.textContent      = this._config.title || 'Stromverbrauch Räume';
    el.totalLabel.textContent = 'Gesamtverbrauch ' + year;

    if (!data) {
      el.totalValue.textContent = '…';
      for (const r of el.rooms) { r.kwh.textContent = '…'; r.pct.textContent = ''; r.bar.style.width = '0%'; }
      el.sonstige.kwh.textContent = '…'; el.sonstige.pct.textContent = ''; el.sonstige.bar.style.width = '0%';
      return;
    }
    if (data.error) {
      el.totalValue.textContent = '!';
      for (const r of el.rooms) { r.kwh.textContent = data.error; r.pct.textContent = ''; r.bar.style.width = '0%'; }
      el.sonstige.kwh.textContent = ''; el.sonstige.pct.textContent = ''; el.sonstige.bar.style.width = '0%';
      return;
    }

    const { total, rooms } = data;

    el.totalValue.textContent = total !== null ? this._fmt(total, 0, 1) : '–';

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const rel  = el.rooms[i];

      if (room.kwh !== null) {
        rel.kwh.textContent = this._fmt(room.kwh, 0, 1) + ' kWh';
        if (total && total > 0) {
          const pct = (room.kwh / total) * 100;
          rel.pct.textContent  = this._fmt(pct, 1) + ' %';
          rel.bar.style.width  = Math.min(100, pct) + '%';
        } else {
          rel.pct.textContent = '–';
          rel.bar.style.width = '0%';
        }
      } else {
        rel.kwh.textContent = '–';
        rel.pct.textContent = '–';
        rel.bar.style.width = '0%';
      }

      // Live-Watt direkt aus hass.states lesen (kein Statistik-Abruf noetig)
      if (rel.watt && rel.power_entity && this._hass) {
        const st = this._hass.states[rel.power_entity];
        const w  = st ? parseFloat(st.state) : NaN;
        rel.watt.textContent = isNaN(w) ? '' : this._fmt(w, 0, 1) + ' W';
      }
    }

    // Sonstige = Gesamtverbrauch minus Summe aller bekannten Raeume
    const roomSum = rooms.reduce((acc, r) => acc + (r.kwh ?? 0), 0);
    const sonstige = (total !== null) ? Math.max(0, total - roomSum) : null;

    if (sonstige !== null && total && total > 0) {
      const pct = (sonstige / total) * 100;
      el.sonstige.kwh.textContent = this._fmt(sonstige, 0, 1) + ' kWh';
      el.sonstige.pct.textContent = this._fmt(pct, 1) + ' %';
      el.sonstige.bar.style.width = Math.min(100, pct) + '%';
    } else {
      el.sonstige.kwh.textContent = '–';
      el.sonstige.pct.textContent = '–';
      el.sonstige.bar.style.width = '0%';
    }
  }
}

RaumEnergieCard.getStubConfig = () => ({
  title: 'Stromverbrauch Räume',
  total_entity: 'sensor.haus_strom_energie',
  rooms: [
    { name: 'Wohnzimmer', entity: 'sensor.wohnzimmer_energie_kwh' },
    { name: 'Küche',      entity: 'sensor.kueche_energie_kwh'     },
  ],
});

// ── Visueller Config-Editor ──────────────────────────────────────────────
// Inklusive dynamischer Raum-Liste (hinzufügen/entfernen, max. 10 Räume).

class RaumEnergieCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config, rooms: (config.rooms || []).map(r => ({ ...r })) };
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

  _onChange(field, value) {
    if (value === '' || value == null) {
      delete this._config[field];
    } else {
      this._config[field] = value;
    }
    this._fireChanged();
  }

  _onRoomChange(index, field, value) {
    this._config.rooms[index][field] = value;
    this._fireChanged();
  }

  _addRoom() {
    if (this._config.rooms.length >= 10) return;
    this._config.rooms.push({ name: '', entity: '' });
    this._render();
    this._fireChanged();
  }

  _removeRoom(index) {
    this._config.rooms.splice(index, 1);
    this._render();
    this._fireChanged();
  }

  _render() {
    if (!this._config) return;
    const cfg = this._config;

    this.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
        .row { display: flex; flex-direction: column; gap: 4px; }
        .row label { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
        .row input[type="text"] {
          padding: 8px 10px; border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px; background: var(--card-background-color, #fff);
          color: var(--primary-text-color); font-size: 14px; box-sizing: border-box;
        }
        .section-label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--secondary-text-color);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 12px; margin-top: 4px;
        }
        .room-card {
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px; padding: 10px; display: flex;
          flex-direction: column; gap: 8px; position: relative;
        }
        .room-header { display: flex; justify-content: space-between; align-items: center; }
        .room-header span { font-size: 12px; color: var(--secondary-text-color); font-weight: 600; }
        .remove-btn {
          font-size: 11px; color: var(--error-color, #c62828);
          background: none; border: none; cursor: pointer; padding: 2px 6px;
        }
        .remove-btn:hover { text-decoration: underline; }
        .add-btn {
          padding: 8px 12px; border: 1px dashed var(--divider-color, #ccc);
          border-radius: 6px; background: none; color: var(--primary-color, #03a9f4);
          font-size: 13px; cursor: pointer;
        }
        .add-btn:hover { background: rgba(3,169,244,.08); }
        .add-btn:disabled { opacity: .4; cursor: default; }
        .rooms-list { display: flex; flex-direction: column; gap: 10px; }
        .hint { font-size: 11px; color: var(--secondary-text-color); }
      </style>
      <div class="form"></div>
    `;
    const form = this.querySelector('.form');

    // Titel
    const titleRow = document.createElement('div');
    titleRow.className = 'row';
    titleRow.innerHTML = `<label>Titel</label>`;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = cfg.title ?? '';
    titleInput.placeholder = 'Stromverbrauch Räume';
    titleInput.addEventListener('change', ev => this._onChange('title', ev.target.value));
    titleRow.appendChild(titleInput);
    form.appendChild(titleRow);

    // Gesamt-Entity
    const totalRow = document.createElement('div');
    totalRow.className = 'row';
    totalRow.innerHTML = `<label>Gesamt-Energie-Entity (Pflicht)</label>`;
    const totalSelector = document.createElement('ha-selector');
    totalSelector.hass = this._hass;
    totalSelector.selector = { entity: {} };
    totalSelector.value = cfg.total_entity ?? '';
    totalSelector.addEventListener('value-changed', ev => {
      ev.stopPropagation();
      this._onChange('total_entity', ev.detail.value);
    });
    totalRow.appendChild(totalSelector);
    form.appendChild(totalRow);

    // Räume
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'section-label';
    sectionLabel.textContent = `Räume (${cfg.rooms.length}/10)`;
    form.appendChild(sectionLabel);

    const roomsHint = document.createElement('div');
    roomsHint.className = 'hint';
    roomsHint.style.marginTop = '-6px';
    roomsHint.textContent = 'Bis zu 10 Räume, jeweils mit frei wählbarer Beschriftung (Name) und zugehöriger Energie-Entity.';
    form.appendChild(roomsHint);

    const roomsList = document.createElement('div');
    roomsList.className = 'rooms-list';

    cfg.rooms.forEach((room, i) => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';

      const header = document.createElement('div');
      header.className = 'room-header';
      const headerLabel = document.createElement('span');
      headerLabel.textContent = `Raum ${i + 1}`;
      header.appendChild(headerLabel);
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Entfernen';
      removeBtn.addEventListener('click', () => this._removeRoom(i));
      header.appendChild(removeBtn);
      roomCard.appendChild(header);

      const nameRow = document.createElement('div');
      nameRow.className = 'row';
      nameRow.innerHTML = `<label>Name</label>`;
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = room.name ?? '';
      nameInput.placeholder = 'z.B. Wohnzimmer';
      nameInput.addEventListener('change', ev => this._onRoomChange(i, 'name', ev.target.value));
      nameRow.appendChild(nameInput);
      roomCard.appendChild(nameRow);

      const entityRow = document.createElement('div');
      entityRow.className = 'row';
      entityRow.innerHTML = `<label>Entity</label>`;
      const entitySelector = document.createElement('ha-selector');
      entitySelector.hass = this._hass;
      entitySelector.selector = { entity: {} };
      entitySelector.value = room.entity ?? '';
      entitySelector.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._onRoomChange(i, 'entity', ev.detail.value);
      });
      entityRow.appendChild(entitySelector);
      roomCard.appendChild(entityRow);

      const powerRow = document.createElement('div');
      powerRow.className = 'row';
      powerRow.innerHTML = `<label>Live-Leistung-Entity (optional)</label>`;
      const powerSelector = document.createElement('ha-selector');
      powerSelector.hass = this._hass;
      powerSelector.selector = { entity: {} };
      powerSelector.value = room.power_entity ?? '';
      powerSelector.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._onRoomChange(i, 'power_entity', ev.detail.value);
      });
      powerRow.appendChild(powerSelector);
      roomCard.appendChild(powerRow);

      roomsList.appendChild(roomCard);
    });

    form.appendChild(roomsList);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Raum hinzufügen';
    addBtn.disabled = cfg.rooms.length >= 10;
    addBtn.addEventListener('click', () => this._addRoom());
    form.appendChild(addBtn);
  }
}

customElements.define('raum-energie-card-editor', RaumEnergieCardEditor);

customElements.define('raum-energie-card', RaumEnergieCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'raum-energie-card',
  name: 'Raum-Energie by Lutarym',
  description: 'Jahresverbrauch pro Raum mit prozentualem Anteil am Gesamtverbrauch.',
});

console.info(
  '%c RAUM-ENERGIE-CARD %c v1.0.0 ',
  'color:white;background:#6a1b9a;font-weight:700;border-radius:3px 0 0 3px;',
  'color:#6a1b9a;background:white;font-weight:700;border-radius:0 3px 3px 0;'
);

// ════════════════════════════════════════════════════════════════
// 4. WALLBOX BY LUTARYM (custom:wallbox-card)
// ════════════════════════════════════════════════════════════════

/**
 * Wallbox Card fuer Home Assistant (Lovelace)
 *
 * Zeigt den Ladezustand einer Wallbox: aktuelle Ladeleistung, Ladestrom,
 * geladene Energie (Session/heute), Verbindungsstatus und optional einen
 * Start/Stop-Schalter sowie die Kosten der aktuellen Ladung.
 *
 * INSTALLATION
 *   1. Datei nach /config/www/wallbox-card.js kopieren
 *   2. Einstellungen > Dashboards > Ressourcen > Ressource hinzufuegen:
 *        URL:  /local/wallbox-card.js
 *        Typ:  JavaScript-Modul
 *   3. Browser-Cache leeren (Strg+F5)
 *
 * KONFIGURATION
 *   type: custom:wallbox-card
 *   power_entity: sensor.wallbox_ladeleistung     # PFLICHT (W oder kW)
 *   current_entity: sensor.wallbox_ladestrom       # optional (A)
 *   energy_entity: sensor.wallbox_energie_session  # optional (kWh, Session/heute)
 *   plug_entity: binary_sensor.wallbox_verbunden   # optional (Stecker erkannt)
 *   status_entity: sensor.wallbox_status           # optional (Text-Status, hat Vorrang)
 *   switch_entity: switch.wallbox_laden            # optional (Start/Stop Button)
 *   price_per_kwh: 0.32                            # optional: Kosten der Session
 *   currency: EUR                                  # optional (Default: EUR)
 *   idle_threshold_w: 50                            # optional: ab wann "laedt" (Default 50 W)
 *   title: Wallbox                                  # optional
 */

class WallboxCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass   = null;
    this._config = null;
    this._el     = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config || !config.power_entity)
      throw new Error('Pflichtfeld "power_entity" fehlt.');
    this._config = config;
    this._build();
    this._render();
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement('wallbox-card-editor');
  }

  // ---- Hilfsfunktionen --------------------------------------------------

  _fmt(v, minD, maxD) {
    return Number(v).toLocaleString('de-DE', {
      minimumFractionDigits: minD,
      maximumFractionDigits: maxD ?? minD,
    });
  }

  // Liefert { value, unit } - normiert Leistung immer auf kW
  _powerKw(stateObj) {
    if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return null;
    const raw  = Number(stateObj.state);
    if (Number.isNaN(raw)) return null;
    const unit = (stateObj.attributes && stateObj.attributes.unit_of_measurement) || 'W';
    return unit.toLowerCase() === 'kw' ? raw : raw / 1000;
  }

  _numState(entityId) {
    if (!entityId || !this._hass) return null;
    const s = this._hass.states[entityId];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
    const v = Number(s.state);
    return Number.isNaN(v) ? null : v;
  }

  _toggle() {
    const cfg = this._config;
    if (!cfg.switch_entity || !this._hass) return;
    this._hass.callService('switch', 'toggle', { entity_id: cfg.switch_entity });
  }

  // ---- DOM aufbauen -------------------------------------------------

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px 18px; box-sizing: border-box; }
        .header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .title {
          font-size: .95rem; font-weight: 500; letter-spacing: .03em;
          text-transform: uppercase; color: var(--secondary-text-color);
        }
        .status-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: .75rem; font-weight: 600; padding: 3px 9px;
          border-radius: 999px; white-space: nowrap;
        }
        .status-badge .dot {
          width: 7px; height: 7px; border-radius: 50%; flex: none;
        }
        .status-charging { background: rgba(76,175,80,.15); color: var(--success-color, #2e7d32); }
        .status-charging .dot { background: var(--success-color, #2e7d32); }
        .status-connected { background: rgba(255,160,0,.15); color: var(--warning-color, #e6a100); }
        .status-connected .dot { background: var(--warning-color, #e6a100); }
        .status-idle { background: rgba(128,128,128,.15); color: var(--secondary-text-color); }
        .status-idle .dot { background: var(--secondary-text-color); }
        .status-error { background: rgba(198,40,40,.15); color: var(--error-color, #c62828); }
        .status-error .dot { background: var(--error-color, #c62828); }

        .hero {
          display: flex; align-items: center; gap: 14px;
        }
        .hero-icon {
          --mdc-icon-size: 40px; color: var(--state-icon-color, var(--primary-color));
          flex: none;
        }
        .hero-icon.off { color: var(--secondary-text-color); opacity: .55; }
        .hero-value { font-size: 2.2rem; font-weight: 600; line-height: 1.05;
          color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
        .hero-label { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }

        .divider { height: 1px; background: var(--divider-color, rgba(128,128,128,.2)); margin: 14px 0; }

        .stats { display: flex; gap: 16px; }
        .stat { flex: 1; }
        .stat .sub-label  { font-size: .75rem; color: var(--secondary-text-color); margin-bottom: 2px; }
        .stat .stat-value { font-size: 1.15rem; font-weight: 600; color: var(--primary-text-color);
          font-variant-numeric: tabular-nums; }

        .cost-row {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-top: 10px; padding-top: 10px; font-size: .85rem;
          border-top: 1px solid var(--divider-color, rgba(128,128,128,.2));
        }
        .cost-row .label { color: var(--secondary-text-color); }
        .cost-row .value { color: var(--primary-text-color); font-variant-numeric: tabular-nums; }

        .toggle-btn {
          margin-top: 14px; width: 100%; padding: 10px 12px; border: none;
          border-radius: 10px; font-size: .9rem; font-weight: 600; cursor: pointer;
          background: var(--primary-color); color: var(--text-primary-color, #fff);
          transition: opacity .15s ease;
        }
        .toggle-btn:active { opacity: .8; }
        .toggle-btn.stop {
          background: transparent; color: var(--error-color, #c62828);
          border: 1px solid var(--error-color, #c62828);
        }

        .note { font-size: .75rem; color: var(--secondary-text-color); margin-top: 8px; }
      </style>
      <ha-card>
        <div class="header">
          <div class="title" id="title"></div>
          <div class="status-badge" id="status-badge">
            <span class="dot"></span><span id="status-text"></span>
          </div>
        </div>
        <div class="hero">
          <ha-icon class="hero-icon" id="hero-icon" icon="mdi:ev-station"></ha-icon>
          <div>
            <div class="hero-value" id="hero-value"></div>
            <div class="hero-label" id="hero-label">Ladeleistung</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="stats">
          <div class="stat">
            <div class="sub-label">Ladestrom</div>
            <div class="stat-value" id="stat-current">–</div>
          </div>
          <div class="stat">
            <div class="sub-label" id="energy-label">Energie</div>
            <div class="stat-value" id="stat-energy">–</div>
          </div>
        </div>
        <div class="cost-row" id="row-cost">
          <span class="label">Kosten</span>
          <span class="value" id="cost-value"></span>
        </div>
        <button class="toggle-btn" id="toggle-btn" style="display:none;"></button>
        <div class="note" id="note"></div>
      </ha-card>`;

    const $ = id => this.shadowRoot.getElementById(id);
    this._el = {
      title: $('title'),
      statusBadge: $('status-badge'), statusText: $('status-text'),
      heroIcon: $('hero-icon'), heroValue: $('hero-value'), heroLabel: $('hero-label'),
      statCurrent: $('stat-current'), energyLabel: $('energy-label'), statEnergy: $('stat-energy'),
      rowCost: $('row-cost'), costValue: $('cost-value'),
      toggleBtn: $('toggle-btn'),
      note: $('note'),
    };

    this._el.toggleBtn.addEventListener('click', () => this._toggle());
  }

  // ---- Rendern --------------------------------------------------------

  _render() {
    if (!this._el || !this._config || !this._hass) return;
    const el       = this._el;
    const cfg      = this._config;
    const currency = cfg.currency || 'EUR';
    const idleW    = cfg.idle_threshold_w != null ? Number(cfg.idle_threshold_w) : 50;

    el.title.textContent = cfg.title || 'Wallbox';

    const powerState = this._hass.states[cfg.power_entity];
    if (!powerState) {
      el.heroValue.textContent = '!';
      el.heroLabel.textContent = 'Entität "' + cfg.power_entity + '" nicht gefunden';
      el.statusBadge.className = 'status-badge status-error';
      el.statusText.textContent = 'Fehler';
      el.rowCost.style.display = 'none';
      el.toggleBtn.style.display = 'none';
      return;
    }

    const powerKw = this._powerKw(powerState);
    const powerW  = powerKw !== null ? powerKw * 1000 : null;
    const charging = powerW !== null && powerW > idleW;

    // Verbindungsstatus
    let plugged = null;
    if (cfg.plug_entity) {
      const p = this._hass.states[cfg.plug_entity];
      if (p) plugged = p.state === 'on';
    }

    // Status ermitteln: status_entity hat Vorrang, sonst aus power/plug abgeleitet
    let statusKey, statusLabel;
    if (cfg.status_entity && this._hass.states[cfg.status_entity]) {
      const raw = this._hass.states[cfg.status_entity].state;
      statusLabel = raw;
      const rawLower = raw.toLowerCase();
      if (rawLower.includes('charg') || rawLower.includes('lad')) statusKey = 'charging';
      else if (rawLower.includes('error') || rawLower.includes('fehler')) statusKey = 'error';
      else if (rawLower.includes('connect') || rawLower.includes('verbund') || rawLower.includes('plug')) statusKey = 'connected';
      else statusKey = 'idle';
    } else if (powerW === null) {
      statusKey = 'error';
      statusLabel = 'Nicht verfügbar';
    } else if (charging) {
      statusKey = 'charging';
      statusLabel = 'Lädt';
    } else if (plugged) {
      statusKey = 'connected';
      statusLabel = 'Verbunden';
    } else if (plugged === false) {
      statusKey = 'idle';
      statusLabel = 'Getrennt';
    } else {
      statusKey = 'idle';
      statusLabel = 'Bereit';
    }

    el.statusBadge.className  = 'status-badge status-' + statusKey;
    el.statusText.textContent = statusLabel;
    el.heroIcon.className     = 'hero-icon' + (charging ? '' : ' off');
    el.heroIcon.setAttribute('icon', charging ? 'mdi:ev-station' : 'mdi:ev-plug-type2');

    el.heroValue.textContent = powerKw !== null ? this._fmt(powerKw, 1, 2) + ' kW' : '–';
    el.heroLabel.textContent = 'Ladeleistung';

    // Ladestrom
    const current = this._numState(cfg.current_entity);
    if (current !== null) {
      const unit = (this._hass.states[cfg.current_entity].attributes || {}).unit_of_measurement || 'A';
      el.statCurrent.textContent = this._fmt(current, 1) + ' ' + unit;
    } else {
      el.statCurrent.textContent = '–';
    }

    // Energie (Session/heute)
    const energy = this._numState(cfg.energy_entity);
    el.energyLabel.textContent = 'Energie';
    if (energy !== null) {
      el.statEnergy.textContent = this._fmt(energy, 1, 2) + ' kWh';
    } else {
      el.statEnergy.textContent = '–';
    }

    // Kosten
    if (cfg.price_per_kwh != null && energy !== null) {
      const cost = energy * Number(cfg.price_per_kwh);
      el.costValue.textContent = this._fmt(cost, 2) + ' ' + currency;
      el.rowCost.style.display = '';
    } else {
      el.rowCost.style.display = 'none';
    }

    // Start/Stop-Schalter
    if (cfg.switch_entity && this._hass.states[cfg.switch_entity]) {
      const on = this._hass.states[cfg.switch_entity].state === 'on';
      el.toggleBtn.style.display = '';
      el.toggleBtn.className = 'toggle-btn' + (on ? ' stop' : '');
      el.toggleBtn.textContent = on ? 'Laden stoppen' : 'Laden starten';
    } else {
      el.toggleBtn.style.display = 'none';
    }

    el.note.textContent = '';
  }
}

WallboxCard.getStubConfig = () => ({
  title: 'Wallbox',
  power_entity: 'sensor.wallbox_ladeleistung',
  current_entity: 'sensor.wallbox_ladestrom',
  energy_entity: 'sensor.wallbox_energie_session',
  plug_entity: 'binary_sensor.wallbox_verbunden',
  switch_entity: 'switch.wallbox_laden',
  price_per_kwh: 0.32,
});

// ── Visueller Config-Editor ──────────────────────────────────────────────

class WallboxCardEditor extends HTMLElement {
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

  _numberRow(label, field, value, placeholder, step) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = 'number';
    if (step) input.step = step;
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

  _render() {
    if (!this._config) return;
    const cfg = this._config;

    this.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 14px; padding: 4px 0; }
        .row { display: flex; flex-direction: column; gap: 4px; }
        .row label { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
        .row input[type="text"], .row input[type="number"] {
          padding: 8px 10px; border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px; background: var(--card-background-color, #fff);
          color: var(--primary-text-color); font-size: 14px; box-sizing: border-box;
        }
        .section-label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--secondary-text-color);
          border-top: 1px solid var(--divider-color, #e0e0e0);
          padding-top: 12px; margin-top: 4px;
        }
      </style>
      <div class="form"></div>
    `;
    const form = this.querySelector('.form');

    form.appendChild(this._textRow('Titel', 'title', cfg.title, 'Wallbox'));
    form.appendChild(this._entityRow('Ladeleistung-Entity (Pflicht)', 'power_entity', cfg.power_entity));
    form.appendChild(this._entityRow('Ladestrom-Entity (optional)', 'current_entity', cfg.current_entity));
    form.appendChild(this._entityRow('Energie-Entity (optional, Session/heute)', 'energy_entity', cfg.energy_entity));
    form.appendChild(this._entityRow('Stecker-Entity (optional)', 'plug_entity', cfg.plug_entity));
    form.appendChild(this._entityRow('Status-Entity (optional, hat Vorrang)', 'status_entity', cfg.status_entity));
    form.appendChild(this._entityRow('Start/Stop-Schalter (optional)', 'switch_entity', cfg.switch_entity));

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'section-label';
    sectionLabel.textContent = 'Kosten & Schwellwerte';
    form.appendChild(sectionLabel);

    form.appendChild(this._numberRow('Preis pro kWh (optional)', 'price_per_kwh', cfg.price_per_kwh, 'z.B. 0.32', '0.01'));
    form.appendChild(this._textRow('Währung', 'currency', cfg.currency, 'EUR'));
    form.appendChild(this._numberRow('Schwellwert "lädt" (W)', 'idle_threshold_w', cfg.idle_threshold_w, '50'));
  }
}

customElements.define('wallbox-card-editor', WallboxCardEditor);

customElements.define('wallbox-card', WallboxCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'wallbox-card',
  name: 'Wallbox by Lutarym',
  description: 'Zeigt Ladeleistung, Ladestrom, Energie und Status einer Wallbox, optional mit Start/Stop-Button.',
});

console.info(
  '%c WALLBOX-CARD %c v1.0.0 ',
  'color:white;background:#03a9f4;font-weight:700;border-radius:3px 0 0 3px;',
  'color:#03a9f4;background:white;font-weight:700;border-radius:0 3px 3px 0;'
);

// ════════════════════════════════════════════════════════════════
// 5. BYD BATTERY BY LUTARYM (custom:battery-card)
// ════════════════════════════════════════════════════════════════

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
