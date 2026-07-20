/**
 * lutarym-energy-card.js
 * Lovelace Custom Card — combined monthly bar charts
 * Covers: self-sufficiency, power consumption, PV yield, wallbox, heat pump, air conditioning
 * Current year + previous year(s) as comparison bars
 *
 * YAML:
 *   type: custom:lutarym-energy-card
 *   card_type: energy      # autarkie | energy | pv | wallbox | wp | klima | akku | einspeisung
 *   entity: sensor.xyz     # optional, overrides the preset default
 *   title: My Title        # optional, overrides the preset default
 *   color: "#00b4d8"       # optional, overrides the preset default (current year)
 *   color_prev: "#888888"  # optional, overrides the preset default (previous year)
 *   color_text: "#1c1c1c"  # optional, text/value color (default: follows theme)
 *   color_dim: "#00b4d855" # optional, muted color (past months, current year)
 *   appearance: auto       # optional: auto | light | dark
 *   title_font_size: 14    # optional, title font size in px (default: 14)
 *   label_font_size: 10    # optional, chart label font size in px (default: automatic)
 *   years_back: 1           # optional: 0 | 1 | 2 | 3 — additional previous years, 0 = current year only (default: 1)
 *   stat_mode: mean         # optional, only for presets with a range option (currently "akku"): mean | minmax
 *                            # "minmax" keeps the bar itself anchored at 0 (height = monthly mean, same as
 *                            # every other card type) and overlays the monthly min/max as a whisker (a
 *                            # vertical line with caps) on the same scale — same axis, no number label.
 *   kwp: 14.4               # optional, only for "pv": installed capacity — dashed reference line on a right-hand kW axis
 *   power_entity: sensor.xyz # optional, only for "pv": instantaneous power sensor (kW/W) — shows the monthly
 *                             # peak (max) as a short tick on top of each bar, on the same right-hand kW axis
 *                             # as kwp. Needs a *separate* entity from the energy sensor above, since power
 *                             # (instantaneous) and energy (cumulative) are different measurements — HA only
 *                             # computes meaningful min/mean/max statistics for the former.
 *
 * Added via the UI ("Add Card" → "Energy Card by Lutarym"); the card type
 * plus optional overrides can be chosen conveniently in the visual editor.
 */

// ── Simple i18n helper (falls back to English) ─────────────────────────

const I18N = {
  en: {
    editorCardType: 'Card type',
    editorEntity: 'Entity',
    editorEntityHint: 'Optional — default for "{preset}": {entity}',
    editorEntityRequiredHint: 'Required — no default entity, please select one for your setup',
    editorTitle: 'Title',
    editorTitleHint: 'Optional — default: {title}',
    editorTitleFontSize: 'Title font size',
    editorTitleFontSizeHint: 'Default: 14px',
    editorLabelFontSize: 'Label font size',
    editorLabelFontSizeHint: 'Month/axis/value labels — default: automatic',
    editorYearsBack: 'Years back',
    editorYearsBackHint: 'How many past years to show in addition to the current year',
    yearsBack0: 'Current year only (no comparison)',
    yearsBack1: '1 year back (2 years total)',
    yearsBack2: '2 years back (3 years total)',
    yearsBack3: '3 years back (4 years total)',
    editorStatMode: 'Display',
    editorStatModeHint: 'How each month is summarized',
    statModeMean: 'Average',
    statModeMinMax: 'Min/max range',
    editorKwp: 'Installed capacity (kWp)',
    editorKwpHint: 'Optional — draws a reference line with its own scale on the right',
    editorPowerEntity: 'Power entity (kW)',
    editorPowerEntityHint: 'Optional — instantaneous power sensor, shows the monthly peak as a marker on each bar',
    sectionColors: 'Colors',
    colorCurrentYear: 'Current year',
    colorCurrentYearHint: 'Default for "{preset}": {color}',
    colorPreviousYears: 'Previous year(s)',
    colorPreviousYearsHint: 'Default: {color}',
    colorTextValues: 'Text / values',
    colorTextValuesHint: 'Default: follows dashboard theme',
    colorDimLabel: 'Muted color',
    colorDimHint: 'Past months, current year — default: automatically derived from the main color',
    editorAppearance: 'Appearance',
    editorAppearanceHint: 'Automatic follows the dashboard theme; light/dark forces fixed colors for this card only',
    appearanceAuto: 'Automatic (dashboard theme)',
    appearanceLight: 'Force light',
    appearanceDark: 'Force dark',
    resetLabel: 'Reset',
    autoLabel: 'Automatic',
    loading: 'Loading data…',
    notConfigured: 'Select an entity in the card editor to get started.',
    error: 'Error: {msg}',
    unknownError: 'Unknown error',
  },
  de: {
    editorCardType: 'Kartentyp',
    editorEntity: 'Entity',
    editorEntityHint: 'Optional — Standard für "{preset}": {entity}',
    editorEntityRequiredHint: 'Erforderlich — keine Standard-Entity, bitte eine für deine Anlage auswählen',
    editorTitle: 'Titel',
    editorTitleHint: 'Optional — Standard: {title}',
    editorTitleFontSize: 'Schriftgröße Titel',
    editorTitleFontSizeHint: 'Standard: 14px',
    editorLabelFontSize: 'Schriftgröße Beschriftung',
    editorLabelFontSizeHint: 'Monats-/Achsen-/Wertebeschriftung — Standard: automatisch',
    editorYearsBack: 'Jahre zurück',
    editorYearsBackHint: 'Wie viele vergangene Jahre zusätzlich zum aktuellen Jahr angezeigt werden',
    yearsBack0: 'Nur aktuelles Jahr (kein Vergleich)',
    yearsBack1: '1 Jahr zurück (2 Jahre gesamt)',
    yearsBack2: '2 Jahre zurück (3 Jahre gesamt)',
    yearsBack3: '3 Jahre zurück (4 Jahre gesamt)',
    editorStatMode: 'Darstellung',
    editorStatModeHint: 'Wie jeder Monat zusammengefasst wird',
    statModeMean: 'Durchschnitt',
    statModeMinMax: 'Min/Max-Bereich',
    editorKwp: 'Installierte Leistung (kWp)',
    editorKwpHint: 'Optional — zeichnet eine Referenzlinie mit eigener Skala rechts',
    editorPowerEntity: 'Leistungs-Entity (kW)',
    editorPowerEntityHint: 'Optional — Momentanleistungs-Sensor, zeigt die monatliche Spitze als Markierung auf jedem Balken',
    sectionColors: 'Farben',
    colorCurrentYear: 'Aktuelles Jahr',
    colorCurrentYearHint: 'Standard für "{preset}": {color}',
    colorPreviousYears: 'Vorjahr(e)',
    colorPreviousYearsHint: 'Standard: {color}',
    colorTextValues: 'Text / Werte',
    colorTextValuesHint: 'Standard: folgt Dashboard-Theme',
    colorDimLabel: 'Schwächerer Farbton',
    colorDimHint: 'Vergangene Monate, aktuelles Jahr — Standard: automatisch aus Hauptfarbe',
    editorAppearance: 'Darstellung',
    editorAppearanceHint: 'Automatisch folgt dem Dashboard-Theme; Hell/Dunkel erzwingt feste Farben nur für diese Karte',
    appearanceAuto: 'Automatisch (Dashboard-Theme)',
    appearanceLight: 'Hell erzwingen',
    appearanceDark: 'Dunkel erzwingen',
    resetLabel: 'Zurücksetzen',
    autoLabel: 'Automatisch',
    loading: 'Lade Daten…',
    notConfigured: 'Wähle im Karten-Editor eine Entity aus, um zu starten.',
    error: 'Fehler: {msg}',
    unknownError: 'Unbekannter Fehler',
  },
};

// Preset display names/titles per language — kept separate from PRESETS
// (below) so the preset data itself stays language-independent.
const PRESET_I18N = {
  en: {
    autarkie: { label: 'Self-Sufficiency', title: 'Self-Sufficiency' },
    energy:   { label: 'Power Consumption', title: 'Power Consumption' },
    pv:       { label: 'PV Yield', title: 'PV Yield' },
    wallbox:  { label: 'Wallbox', title: 'Wallbox' },
    wp:       { label: 'Heat Pump', title: 'Heat Pump' },
    klima:    { label: 'Air Conditioning', title: 'Air Conditioning' },
    akku:     { label: 'Battery State of Charge', title: 'Battery State of Charge' },
    einspeisung: { label: 'Grid Feed-in', title: 'Grid Feed-in' },
  },
  de: {
    autarkie: { label: 'Autarkie', title: 'Autarkie' },
    energy:   { label: 'Stromverbrauch', title: 'Stromverbrauch' },
    pv:       { label: 'PV Ertrag', title: 'PV Ertrag' },
    wallbox:  { label: 'Wallbox', title: 'Wallbox' },
    wp:       { label: 'Wärmepumpe', title: 'Wärmepumpe' },
    klima:    { label: 'Klimaanlage', title: 'Klimaanlage' },
    akku:     { label: 'Akku-Ladezustand', title: 'Akku-Ladezustand' },
    einspeisung: { label: 'Netzeinspeisung', title: 'PV Netz-Einspeisung' },
  },
};

const MONTHS_ABBR = {
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  de: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
};
const MONTHS_INITIAL = {
  en: ['J','F','M','A','M','J','J','A','S','O','N','D'],
  de: ['J','F','M','A','M','J','J','A','S','O','N','D'],
};

function lutarymLang(hass) {
  const raw = (hass && hass.language) || (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en';
  return raw.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function t(hass, key, vars) {
  const dict = I18N[lutarymLang(hass)] || I18N.en;
  let str = dict[key] ?? I18N.en[key] ?? key;
  if (vars) Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
  return str;
}

function presetInfo(hass, cardType) {
  const dict = PRESET_I18N[lutarymLang(hass)] || PRESET_I18N.en;
  return dict[cardType] ?? PRESET_I18N.en[cardType];
}

// ── Presets for the different card types (language-independent data) ───────

const PRESETS = {
  autarkie: {
    entity:     'sensor.autarkie',
    color:      '#22c55e',
    colorPrev:  '#888888',
    unit:       '%',
    statType:   'mean',      // 'mean' = monthly average value (recorder mean)
    fixedMax:   100,         // Y-axis fixed 0-100%
    aggregate:  'avg',       // summary value: average instead of sum
    valueSuffix: '%',
  },
  energy: {
    entity:     'sensor.stromverbrauch',
    color:      '#00b4d8',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  pv: {
    entity:     'sensor.pv_ertrag',
    color:      '#f59e0b',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
    supportsCapacityLine: true, // this preset offers the optional "installed capacity (kWp)" reference line
    supportsPeakPower: true,    // this preset offers the optional monthly peak-power marker (needs a power entity)
  },
  wallbox: {
    entity:     'sensor.wallbox',
    color:      '#3b82f6',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  wp: {
    entity:     'sensor.waermepumpe',
    color:      '#ef4444',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  klima: {
    entity:     'sensor.klimaanlage',
    color:      '#06b6d4',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
  akku: {
    entity:     'sensor.akku_ladezustand',
    color:      '#a855f7',
    colorPrev:  '#888888',
    unit:       '%',
    statType:   'mean',      // default display mode ('mean'); 'minmax' selectable in the editor
    fixedMax:   100,         // Y-axis fixed 0-100%
    aggregate:  'avg',
    valueSuffix: '%',
    supportsRange: true,     // this preset offers the "Display: Average / Min/max range" dropdown
  },
  einspeisung: {
    entity:     '',          // no default — publicly shared card, must not assume anyone's entity naming
    color:      '#ec4899',
    colorPrev:  '#888888',
    unit:       'kWh',
    statType:   'change',
    fixedMax:   null,
    aggregate:  'sum',
    valueSuffix: '',
  },
};

const CARD_TYPE_KEYS = Object.keys(PRESETS);

// ── Main card ───────────────────────────────────────────────────────────

class LutarymEnergyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._seriesYears = [];   // years, oldest first, last = current year
    this._seriesData  = [];   // per year: Array[12] of monthly values
    this._peakPowerData = []; // per year: Array[12] of monthly max power (kW), only when a power entity is configured
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
    const info = presetInfo(this._hass, cardType);

    const newEntity = config.entity ?? preset.entity;
    const rawYearsBack = config.years_back != null ? Number(config.years_back) : 1;
    const newYearsBack = Math.min(3, Math.max(0, rawYearsBack));
    // 'minmax' only applies for presets that opt in (supportsRange); otherwise always 'mean'.
    const newStatMode = (preset.supportsRange && config.stat_mode === 'minmax') ? 'minmax' : 'mean';
    // No default here either — this is a second, distinct entity (instantaneous power,
    // not the cumulative energy entity above), only meaningful for supportsPeakPower presets.
    const newPowerEntity = (preset.supportsPeakPower && config.power_entity) ? config.power_entity : '';
    const entityOrTypeChanged =
      !this._config ||
      this._config.card_type !== cardType ||
      this._config.entity !== newEntity ||
      this._config.powerEntity !== newPowerEntity ||
      this._config.yearsBack !== newYearsBack ||
      this._config.statMode !== newStatMode;

    this._config = {
      card_type:  cardType,
      entity:     newEntity,
      powerEntity: newPowerEntity, // optional second entity (instantaneous power) for the peak-power markers
      title:      config.title      ?? info.title,
      color:      config.color      ?? preset.color,
      colorPrev:  config.color_prev ?? preset.colorPrev,
      colorText:  config.color_text ?? null,   // null = follows theme (var(--primary-text-color))
      colorDim:   config.color_dim  ?? null,   // null = automatically derived muted color
      appearance: config.appearance ?? 'auto', // 'auto' | 'light' | 'dark'
      titleFontSize: Number(config.title_font_size) || 14,
      labelFontSize: config.label_font_size ? Number(config.label_font_size) : null, // null = automatic (responsive)
      yearsBack:  newYearsBack, // 0-3, how many years in addition to the current year are shown
      statMode:   newStatMode,  // 'mean' | 'minmax' — only meaningful for presets with supportsRange
      // Installed capacity reference line — only meaningful for presets with supportsCapacityLine.
      // No default: never assume a value for a card shared publicly. Purely a display constant,
      // doesn't affect data fetching.
      kwp: (preset.supportsCapacityLine && config.kwp != null && config.kwp !== '') ? Number(config.kwp) : null,
    };
    this._preset = preset;

    if (entityOrTypeChanged) {
      // Only reload data on type/entity/years change (not on every
      // keystroke in the editor's title/color fields — avoids preview flicker).
      this._lastFetch = 0;
      this._seriesYears = [];
      this._seriesData  = [];
      this._loading   = !!this._config.entity;
      if (this._hass && this._config.entity) this._fetchData();
    }

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config?.entity && Date.now() - this._lastFetch > 3_600_000) {
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

  // Modern approach (HA automatically renders a native <ha-form> if the
  // editor component below fails to load for some reason). Serves as a
  // fallback/extra safeguard so a GUI form is guaranteed to appear.
  static getConfigForm() {
    const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en';
    const fallbackHass = { language: lang };
    return {
      schema: [
        {
          name: 'card_type',
          required: true,
          selector: {
            select: {
              mode: 'dropdown',
              options: CARD_TYPE_KEYS.map(k => ({ value: k, label: presetInfo(fallbackHass, k).label })),
            },
          },
        },
        { name: 'entity', selector: { entity: {} } },
        { name: 'title', selector: { text: {} } },
        {
          name: 'stat_mode',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'mean',   label: t(fallbackHass, 'statModeMean') },
                { value: 'minmax', label: t(fallbackHass, 'statModeMinMax') },
              ],
            },
          },
        },
        {
          name: 'years_back',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: '0', label: t(fallbackHass, 'yearsBack0') },
                { value: '1', label: t(fallbackHass, 'yearsBack1') },
                { value: '2', label: t(fallbackHass, 'yearsBack2') },
                { value: '3', label: t(fallbackHass, 'yearsBack3') },
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
                { value: 'auto', label: t(fallbackHass, 'appearanceAuto') },
                { value: 'light', label: t(fallbackHass, 'appearanceLight') },
                { value: 'dark', label: t(fallbackHass, 'appearanceDark') },
              ],
            },
          },
        },
        { name: 'title_font_size', selector: { number: { min: 8, max: 32, mode: 'box', unit_of_measurement: 'px' } } },
        { name: 'label_font_size', selector: { number: { min: 6, max: 20, mode: 'box', unit_of_measurement: 'px' } } },
      ],
      computeLabel: (schema) => ({
        card_type: t(fallbackHass, 'editorCardType'),
        entity: t(fallbackHass, 'editorEntity'),
        title: t(fallbackHass, 'editorTitle'),
        stat_mode: t(fallbackHass, 'editorStatMode'),
        years_back: t(fallbackHass, 'editorYearsBack'),
        color: t(fallbackHass, 'colorCurrentYear'),
        color_prev: t(fallbackHass, 'colorPreviousYears'),
        color_text: t(fallbackHass, 'colorTextValues'),
        color_dim: t(fallbackHass, 'colorDimLabel'),
        appearance: t(fallbackHass, 'editorAppearance'),
        title_font_size: t(fallbackHass, 'editorTitleFontSize'),
        label_font_size: t(fallbackHass, 'editorLabelFontSize'),
      })[schema.name] ?? schema.name,
    };
  }

  // ── Data fetching ────────────────────────────────────────────────────

  // True if the current preset+config combination should fetch/render the
  // "min/max range per month" view instead of a single value per month.
  _isRangeMode() {
    return !!(this._preset?.supportsRange && this._config?.statMode === 'minmax');
  }

  async _fetchYear(year) {
    const rangeMode = this._isRangeMode();
    const statType  = this._preset.statType; // 'mean' or 'change'
    const types     = rangeMode ? ['mean', 'min', 'max'] : [statType];
    const wsRequest = {
      type:          'recorder/statistics_during_period',
      start_time:    new Date(year, 0, 1).toISOString(),
      end_time:      new Date(year + 1, 0, 1).toISOString(),
      statistic_ids: [this._config.entity],
      period:        'month',
      types,
    };
    if (!rangeMode && statType === 'change') {
      wsRequest.units = { energy: 'kWh' };
    }

    const result = await this._hass.callWS(wsRequest);
    const stats = result?.[this._config.entity] ?? [];
    return Array.from({ length: 12 }, (_, month) => {
      const entry = stats.find(s => new Date(s.start).getMonth() === month);
      if (!entry) return null;
      if (rangeMode) {
        if (entry.min == null && entry.max == null && entry.mean == null) return null;
        return { mean: entry.mean ?? null, min: entry.min ?? null, max: entry.max ?? null };
      }
      return entry[statType] ?? null;
    });
  }

  // Monthly peak (max) instantaneous power from the separate power entity —
  // this is a different measurement than the energy entity above (power vs.
  // cumulative energy), so it needs its own recorder query. Only called when
  // a power entity is actually configured.
  async _fetchPeakPower(year) {
    const entity = this._config.powerEntity;
    const wsRequest = {
      type:          'recorder/statistics_during_period',
      start_time:    new Date(year, 0, 1).toISOString(),
      end_time:      new Date(year + 1, 0, 1).toISOString(),
      statistic_ids: [entity],
      period:        'month',
      types:         ['max'],
      units:         { power: 'kW' }, // normalize regardless of whether the entity reports W, kW, ...
    };
    const result = await this._hass.callWS(wsRequest);
    const stats = result?.[entity] ?? [];
    return Array.from({ length: 12 }, (_, month) => {
      const entry = stats.find(s => new Date(s.start).getMonth() === month);
      return entry?.max ?? null;
    });
  }

  async _fetchData() {
    this._loading = true;
    this._error   = null;
    this._render();

    const currentYear = new Date().getFullYear();
    const yearsBack    = this._config.yearsBack;
    // oldest first, current year last — so bars are arranged from left
    // (oldest year) to right (current year).
    const years = [];
    for (let y = currentYear - yearsBack; y <= currentYear; y++) years.push(y);

    try {
      const results = await Promise.all(years.map(y => this._fetchYear(y)));
      this._seriesYears = years;
      this._seriesData  = results;

      if (this._preset.supportsPeakPower && this._config.powerEntity) {
        this._peakPowerData = await Promise.all(years.map(y => this._fetchPeakPower(y)));
      } else {
        this._peakPowerData = [];
      }
    } catch (err) {
      console.error('[lutarym-energy-card]', err);
      this._error = err.message ?? t(this._hass, 'unknownError');
    }

    this._loading = false;
    this._render();
  }

  // ── Helpers ───────────────────────────────────────────────────────

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

  // Continuous scaling of the label font size based on the actual card
  // width AND height (instead of fixed steps) — text grows/shrinks
  // smoothly as the card is resized. A manually set label font size
  // (label_font_size) still overrides this fixed value.
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

  // Height of title + summary row + chart padding — everything except the
  // actual chart. Needed to know how much of the total available card
  // height remains for the chart itself.
  _nonChartOverhead(px) {
    const titleFontSize = this._config.titleFontSize || 14;
    const headerH = 14 + titleFontSize * 1.3 + 2; // padding-top + line height + padding-bottom
    const showTotal = px === 0 || px >= 280;
    const totalsH = showTotal ? 32 : 0;
    const chartPaddingBottom = 10;
    return headerH + totalsH + chartPaddingBottom;
  }

  // Effective chart height: follows the card height measured by the
  // ResizeObserver (this._height) once known — e.g. when the card is
  // resized taller/shorter in a Sections/grid dashboard. Without a
  // known/external height (classic Masonry dashboard) the responsive
  // breakpoint default is used instead.
  _effectiveChartHeight(defaultH, px) {
    if (!this._height) return defaultH;
    const overhead = this._nonChartOverhead(px);
    const available = this._height - overhead;
    const MIN_CHART_H = 100;
    return Math.max(MIN_CHART_H, Math.round(available));
  }

  // Color for a given year series: the last series (current year) uses
  // "color", the second-to-last (immediate previous year) uses "colorPrev"
  // unchanged, further-back years use increasingly transparent variants of
  // colorPrev so they stand out clearly from the previous year.
  _seriesColor(index, total) {
    const isCurrent = index === total - 1;
    if (isCurrent) return this._config.color;
    const distance = total - 1 - index; // 1 = immediate previous year, 2/3 = further back
    const FADE = { 1: '', 2: 'aa', 3: '77' };
    return this._config.colorPrev + (FADE[distance] ?? '77');
  }

  // Blends a hex color with white to produce a pale preview/fallback
  // variant (e.g. for the "muted color" preview swatch in the editor,
  // since <input type="color"> can't represent transparency).
  static blendWithWhite(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const mix = c => Math.round(c * alpha + 255 * (1 - alpha));
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ── SVG chart ─────────────────────────────────────────────────────────

  _buildChart(currentMonth) {
    const lang = lutarymLang(this._hass);
    const MONTHS_ABBR_L    = MONTHS_ABBR[lang];
    const MONTHS_INITIAL_L = MONTHS_INITIAL[lang];

    const px = this._width || 400;
    const lp = this._layoutParams(px);
    const rangeMode = this._isRangeMode();
    const kwp = (this._preset.supportsCapacityLine && this._config.kwp) ? this._config.kwp : null;
    const hasPeakPower = !!(this._preset.supportsPeakPower && this._config.powerEntity);
    // Both the kWp line and the peak-power markers are in kW/kWp — a
    // genuinely different unit than the left axis's kWh — so they share
    // one right-hand scale.
    const showRightAxis = kwp != null || hasPeakPower;
    const pad = showRightAxis ? { ...lp.pad, right: lp.pad.right + 34 } : lp.pad;
    const { monthStyle, barRatio } = lp;
    const H = this._effectiveChartHeight(lp.H, px);
    const { fMonth, fAxis, fVal } = this._labelFontSizes(px, H, lp.H);

    const W     = px;
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const slotW = plotW / 12;

    const years  = this._seriesYears;
    const series = this._seriesData;
    const N      = Math.max(years.length, 1);
    const lastIndex = N - 1; // index of the current year (last series)

    // N bars per month side by side, with a small gap between them
    const gap      = slotW * (N > 2 ? 0.035 : 0.06);
    const totalGap = gap * (N - 1);
    const barW     = (slotW * barRatio - totalGap) / N;
    const groupW   = barW * N + totalGap;
    const groupOff = (slotW - groupW) / 2;

    const colorDim  = this._config.colorDim || (this._config.color + '55');
    const colorText = this._config.colorText || 'var(--primary-text-color)';

    // Max value: fixed (e.g. self-sufficiency/battery 0-100%) or dynamic across all series
    let maxVal;
    if (this._preset.fixedMax != null) {
      maxVal = this._preset.fixedMax;
    } else if (rangeMode) {
      const allMax = series.flat().filter(v => v !== null).map(v => v.max).filter(v => v != null && v >= 0);
      maxVal = this._niceMax(allMax.length ? Math.max(...allMax) : 0);
    } else {
      const allVals = series.flat().filter(v => v !== null && v >= 0);
      maxVal = this._niceMax(allVals.length ? Math.max(...allVals) : 0);
    }

    // Right-axis (kW) scale — covers both the static kWp line and the
    // measured monthly peaks, so a peak that slightly exceeds the nameplate
    // capacity (e.g. brief overproduction) still fits on the axis.
    let rightMax = null;
    if (showRightAxis) {
      const peakVals = hasPeakPower
        ? (this._peakPowerData || []).flat().filter(v => v != null && v >= 0)
        : [];
      const candidates = kwp != null ? [...peakVals, kwp] : peakVals;
      rightMax = this._niceMax(candidates.length ? Math.max(...candidates) : (kwp || 1));
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
      const isFutureMonth = m > currentMonth; // only relevant for the current year

      for (let s = 0; s < N; s++) {
        const isCurrentSeries = s === lastIndex;
        const val = series[s] ? series[s][m] : null;
        const isFuture = isCurrentSeries && isFutureMonth;
        const xBar = pad.left + m * slotW + groupOff + s * (barW + gap);

        if (isFuture) {
          bars += `<rect x="${xBar.toFixed(1)}" y="${(pad.top + plotH - 3).toFixed(1)}" width="${barW.toFixed(1)}" height="3" fill="var(--divider-color)" rx="1"/>`;
          continue;
        }

        const isEmpty = val === null || (rangeMode && val.min == null && val.max == null && val.mean == null);
        if (isEmpty) {
          bars += `<rect x="${xBar.toFixed(1)}" y="${(pad.top + plotH - 1).toFixed(1)}" width="${barW.toFixed(1)}" height="1" fill="var(--divider-color)" rx="1"/>`;
          continue;
        }

        const isCurrentMonthOfCurrentSeries = isCurrentSeries && m === currentMonth;
        const fill = isCurrentSeries
          ? (isCurrentMonthOfCurrentSeries ? this._config.color : colorDim)
          : this._seriesColor(s, N);

        // The bar itself always starts at 0, exactly like every other card
        // type — in range mode its height is the monthly mean. Min/max is a
        // separate whisker overlay on the same (left) axis, not a change to
        // where the bar starts.
        const primaryVal = rangeMode ? (val.mean ?? 0) : val;
        const bH = Math.max((Math.max(primaryVal, 0) / maxVal) * plotH, 1);
        const bY = pad.top + plotH - bH;
        bars += `<rect x="${xBar.toFixed(1)}" y="${bY.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${fill}" rx="2"/>`;

        if (rangeMode) {
          const minV = val.min ?? primaryVal;
          const maxV = val.max ?? primaryVal;
          const yMin = pad.top + plotH - (Math.max(minV, 0) / maxVal) * plotH;
          const yMax = pad.top + plotH - (Math.max(maxV, 0) / maxVal) * plotH;
          const wx   = xBar + barW / 2;
          const capW = Math.max(barW * 0.4, 5);
          bars += `<line x1="${wx.toFixed(1)}" y1="${yMin.toFixed(1)}" x2="${wx.toFixed(1)}" y2="${yMax.toFixed(1)}" stroke="${colorText}" stroke-width="1.5"/>`;
          bars += `<line x1="${(wx - capW / 2).toFixed(1)}" y1="${yMax.toFixed(1)}" x2="${(wx + capW / 2).toFixed(1)}" y2="${yMax.toFixed(1)}" stroke="${colorText}" stroke-width="1.5"/>`;
          bars += `<line x1="${(wx - capW / 2).toFixed(1)}" y1="${yMin.toFixed(1)}" x2="${(wx + capW / 2).toFixed(1)}" y2="${yMin.toFixed(1)}" stroke="${colorText}" stroke-width="1.5"/>`;
          // No number label here — it read as belonging to the (black) whisker
          // rather than the (colored) bar. The summary line above the chart
          // already gives the exact Ø/min/max figures.
        } else if (isCurrentSeries && fVal > 0 && primaryVal > 0) {
          // Value label only for the current year (otherwise too cluttered with multiple years)
          valLabels += `<text x="${(xBar + barW / 2).toFixed(1)}" y="${(bY - 3).toFixed(1)}" text-anchor="middle" font-size="${fVal}" fill="${colorText}">${primaryVal.toFixed(0)}${this._preset.valueSuffix}</text>`;
        }

        // Monthly peak power — a short tick per bar (not a line across the
        // whole year), positioned against the shared right kW axis.
        if (hasPeakPower) {
          const peakVal = this._peakPowerData[s] ? this._peakPowerData[s][m] : null;
          if (peakVal != null) {
            const yPeak = pad.top + plotH - (Math.min(Math.max(peakVal, 0), rightMax) / rightMax) * plotH;
            const tickW = Math.max(barW * 0.6, 5);
            const tx = xBar + barW / 2;
            bars += `<line x1="${(tx - tickW / 2).toFixed(1)}" y1="${yPeak.toFixed(1)}" x2="${(tx + tickW / 2).toFixed(1)}" y2="${yPeak.toFixed(1)}" stroke="${colorText}" stroke-width="2" stroke-linecap="round"/>`;
          }
        }
      }

      const label  = monthStyle === 'initial' ? MONTHS_INITIAL_L[m] : MONTHS_ABBR_L[m];
      const isCurrentMonth = m === currentMonth;
      const weight = isCurrentMonth ? 'bold' : 'normal';
      const fcolor = isCurrentMonth ? colorText : 'var(--secondary-text-color)';
      xLabels += `<text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="${fMonth}" font-weight="${weight}" fill="${fcolor}">${label}</text>`;
    }

    // Legend: one entry per displayed year
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

    // Right axis (kW) — shared by the installed-capacity line and the
    // peak-power ticks, since both are in the same unit.
    let kwpLine = '';
    const unitLabelRight = showRightAxis
      ? `<text x="${(pad.left + plotW + 4).toFixed(1)}" y="${(pad.top - 10).toFixed(1)}" text-anchor="start" font-size="${fAxis}" fill="var(--secondary-text-color)">kW</text>`
      : '';
    const axesRight = showRightAxis
      ? `<line x1="${(pad.left + plotW).toFixed(1)}" y1="${pad.top}" x2="${(pad.left + plotW).toFixed(1)}" y2="${(pad.top + plotH).toFixed(1)}" stroke="var(--secondary-text-color)" stroke-width="1"/>`
      : '';
    const zeroLabelRight = showRightAxis
      ? `<text x="${(pad.left + plotW + 6).toFixed(1)}" y="${(pad.top + plotH + 4).toFixed(1)}" text-anchor="start" font-size="${fAxis}" fill="var(--secondary-text-color)">0</text>`
      : '';
    if (kwp != null) {
      const yKwp = pad.top + plotH - (Math.min(kwp, rightMax) / rightMax) * plotH;
      kwpLine = `
        <line x1="${pad.left}" y1="${yKwp.toFixed(1)}" x2="${(pad.left + plotW).toFixed(1)}" y2="${yKwp.toFixed(1)}" stroke="${colorText}" stroke-width="1" stroke-dasharray="5 3" opacity="0.85"/>
        <text x="${(pad.left + plotW + 6).toFixed(1)}" y="${(yKwp - 4).toFixed(1)}" text-anchor="start" font-size="${fAxis}" fill="${colorText}">${kwp} kWp</text>
      `;
    }

    const axes = `
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="var(--secondary-text-color)" stroke-width="1"/>
      ${axesRight}
    `;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;display:block;">
      ${grid}${bars}${kwpLine}${valLabels}${xLabels}${yLabels}${unitLabel}${unitLabelRight}${zeroLabelRight}${axes}${legend}
    </svg>`;
  }

  // ── Appearance mode (auto follows dashboard theme via HA CSS vars;
  //    light/dark force local overrides only for this card instance) ──

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
    return ''; // auto: nothing overridden, HA theme variables apply as usual
  }

  // ── Summary (average or sum depending on the preset) ─────────────────

  _summary(arr) {
    const vals = arr.filter(v => v !== null);
    if (!vals.length) return null;
    if (this._isRangeMode()) {
      const means = vals.map(v => v.mean).filter(v => v != null);
      const mins  = vals.map(v => v.min).filter(v => v != null);
      const maxs  = vals.map(v => v.max).filter(v => v != null);
      return {
        mean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null,
        min:  mins.length ? Math.min(...mins) : null,
        max:  maxs.length ? Math.max(...maxs) : null,
      };
    }
    if (this._preset.aggregate === 'avg') {
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return vals.reduce((a, b) => a + b, 0);
  }

  _formatSummary(val) {
    if (val === null) return '–';
    const unit = this._preset.unit;
    if (this._isRangeMode()) {
      const suffix = this._preset.valueSuffix;
      const meanStr = val.mean != null ? val.mean.toFixed(0) : '–';
      if (val.min != null && val.max != null) {
        return `Ø ${meanStr}${suffix} (${val.min.toFixed(0)}–${val.max.toFixed(0)}${suffix})`;
      }
      return `Ø ${meanStr}${suffix}`;
    }
    if (this._preset.aggregate === 'avg') {
      return `Ø ${val.toFixed(1)} ${unit}`;
    }
    return `${val.toFixed(0)} ${unit}`;
  }

  // ── Render ────────────────────────────────────────────────────────────

  _render() {
    if (!this._config) return;
    const hass = this._hass;

    const now          = new Date();
    const currentMonth = now.getMonth();
    const years        = this._seriesYears;
    const lastIndex    = years.length - 1;
    const px           = this._width || 0;

    let body;
    if (!this._config.entity) {
      body = `<div class="loading">${t(hass, 'notConfigured')}</div>`;
    } else if (this._loading) {
      body = `<div class="loading">${t(hass, 'loading')}</div>`;
    } else if (this._error) {
      body = `<div class="error">${t(hass, 'error', { msg: this._error })}</div>`;
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
      if (this._hass && this._config.entity) this._fetchData();
    });
  }

  // Dynamic height estimation instead of a fixed value — otherwise the
  // area reserved by Home Assistant in Masonry/Sections dashboards
  // wouldn't match the actually rendered height (which depends on card
  // width, title, and label font size), causing overlaps or gaps.
  _estimatedPixelHeight() {
    const px = this._width || 400;
    const lp = this._layoutParams(px);
    return this._nonChartOverhead(px) + lp.H;
  }

  getCardSize() {
    return Math.max(1, Math.ceil(this._estimatedPixelHeight() / 50));
  }

  // For the newer "Sections" dashboards: grid height in rows (1 row ≈ 56px)
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

// ── Visual config editor ────────────────────────────────────────────────
// Uses native HA form elements (<ha-selector>) so the input form looks
// exactly like built-in Home Assistant cards: a dropdown for the card
// type, a searchable entity picker, and text/color fields. NOTHING needs
// to be entered via YAML — everything runs through this GUI.

class LutarymEnergyCardEditor extends HTMLElement {
  setConfig(config) {
    // IMPORTANT: Home Assistant calls setConfig again even when WE
    // ourselves just fired config-changed (e.g. on every keystroke in a
    // text field). If we rebuilt the entire form every time (_render with
    // innerHTML), the currently focused input field would lose
    // focus/cursor on every keystroke. So only re-render on the very
    // first call, or when the card type changed externally (e.g. via
    // undo or manual YAML editing).
    const firstLoad    = !this._config;
    const typeChanged   = !firstLoad && config.card_type !== this._config.card_type;

    this._config = { ...config };

    if (firstLoad || typeChanged) {
      this._render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    // entity pickers etc. need hass for autocomplete/display
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
    // Only reset the preset overrides so the new type's presets apply.
    // The outer "type" field (custom:lutarym-energy-card) and any other
    // keys managed by Home Assistant (e.g. grid_options) MUST be
    // preserved — otherwise HA no longer recognizes the card and falls
    // back to the raw YAML editor.
    const preserved = { ...this._config };
    delete preserved.entity;
    delete preserved.title;
    delete preserved.color;
    delete preserved.color_prev;
    delete preserved.stat_mode;
    delete preserved.kwp;
    delete preserved.power_entity;
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
      // Native <select> instead of <ha-selector> for dropdowns: ha-selector
      // is loaded asynchronously by Home Assistant — if the editor is
      // created very early (before the component is registered), clicks
      // and values are occasionally lost ("dropdown behaves incorrectly").
      // Native <select> always works reliably, regardless of load timing.
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

  // Compact native color field (<input type="color">) instead of the very
  // wide ha-selector color picker. effectiveValue is the actually
  // effective value (override, if set, otherwise the preset default) —
  // so the field shows the actual default instead of always black. A
  // "Reset" button removes a set override so the automatic default
  // applies again.
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
    resetBtn.textContent = t(this._hass, 'resetLabel');
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

  // Compact number field for font sizes (px). isAutoAllowed=true shows an
  // "Automatic" button that clears the field. placeholderText is shown
  // when the field is empty — makes it visible which default font size
  // applies, instead of the field just looking empty.
  _numberRow(labelText, hintText, field, value, min, max, isAutoAllowed, placeholderText, step = 1, unitText = 'px') {
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
    input.step = step;
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
    unit.textContent = unitText;
    controls.appendChild(unit);

    let autoBtn;
    if (isAutoAllowed) {
      autoBtn = document.createElement('button');
      autoBtn.type = 'button';
      autoBtn.className = 'color-reset';
      autoBtn.textContent = t(this._hass, 'autoLabel');
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

  // Arrange two form rows side by side instead of stacked
  _sideBySide(...rows) {
    const wrap = document.createElement('div');
    wrap.className = 'row-pair';
    rows.forEach(row => wrap.appendChild(row));
    return wrap;
  }

  _render() {
    if (!this._config) return;
    const hass = this._hass;
    const preset = PRESETS[this._cardType];
    const info = presetInfo(hass, this._cardType);

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
      t(hass, 'editorCardType'),
      null,
      { select: { mode: 'dropdown', options: CARD_TYPE_KEYS.map(k => ({ value: k, label: presetInfo(hass, k).label })) } },
      'card_type',
      this._cardType,
    ));

    form.appendChild(this._row(
      t(hass, 'editorEntity'),
      preset.entity
        ? t(hass, 'editorEntityHint', { preset: info.label, entity: preset.entity })
        : t(hass, 'editorEntityRequiredHint'),
      { entity: {} },
      'entity',
      this._config.entity,
    ));

    form.appendChild(this._row(
      t(hass, 'editorTitle'),
      t(hass, 'editorTitleHint', { title: info.title }),
      { text: {} },
      'title',
      this._config.title,
    ));

    form.appendChild(this._sideBySide(
      this._numberRow(
        t(hass, 'editorTitleFontSize'),
        t(hass, 'editorTitleFontSizeHint'),
        'title_font_size',
        this._config.title_font_size,
        8, 32, true, '14',
      ),
      this._numberRow(
        t(hass, 'editorLabelFontSize'),
        t(hass, 'editorLabelFontSizeHint'),
        'label_font_size',
        this._config.label_font_size,
        6, 20, true, t(hass, 'autoLabel'),
      ),
    ));

    if (preset.supportsRange) {
      form.appendChild(this._row(
        t(hass, 'editorStatMode'),
        t(hass, 'editorStatModeHint'),
        { select: { mode: 'dropdown', options: [
          { value: 'mean',   label: t(hass, 'statModeMean') },
          { value: 'minmax', label: t(hass, 'statModeMinMax') },
        ] } },
        'stat_mode',
        this._config.stat_mode === 'minmax' ? 'minmax' : 'mean',
      ));
    }

    if (preset.supportsCapacityLine) {
      form.appendChild(this._numberRow(
        t(hass, 'editorKwp'),
        t(hass, 'editorKwpHint'),
        'kwp',
        this._config.kwp,
        0, 100, false, null, 0.1, 'kWp',
      ));
    }

    if (preset.supportsPeakPower) {
      form.appendChild(this._row(
        t(hass, 'editorPowerEntity'),
        t(hass, 'editorPowerEntityHint'),
        { entity: {} },
        'power_entity',
        this._config.power_entity,
      ));
    }

    form.appendChild(this._row(
      t(hass, 'editorYearsBack'),
      t(hass, 'editorYearsBackHint'),
      { select: { mode: 'dropdown', options: [
        { value: '0', label: t(hass, 'yearsBack0') },
        { value: '1', label: t(hass, 'yearsBack1') },
        { value: '2', label: t(hass, 'yearsBack2') },
        { value: '3', label: t(hass, 'yearsBack3') },
      ] } },
      'years_back',
      String(this._config.years_back ?? 1),
    ));

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'section-label';
    sectionLabel.textContent = t(hass, 'sectionColors');
    form.appendChild(sectionLabel);

    const effectiveColor = this._config.color ?? preset.color;
    // Preview of the "muted color" as a blended solid color, since a
    // native <input type="color"> can't represent transparency —
    // otherwise the default preview value would look like the plain main
    // color instead of the muted color actually used in the chart.
    const effectiveDim = this._config.color_dim ?? LutarymEnergyCard.blendWithWhite(effectiveColor, 0x55 / 255);

    form.appendChild(this._sideBySide(
      this._colorRow(
        t(hass, 'colorCurrentYear'),
        t(hass, 'colorCurrentYearHint', { preset: info.label, color: preset.color }),
        'color',
        effectiveColor,
        this._config.color != null,
      ),
      this._colorRow(
        t(hass, 'colorPreviousYears'),
        t(hass, 'colorPreviousYearsHint', { color: preset.colorPrev }),
        'color_prev',
        this._config.color_prev ?? preset.colorPrev,
        this._config.color_prev != null,
      ),
    ));

    form.appendChild(this._sideBySide(
      this._colorRow(
        t(hass, 'colorTextValues'),
        t(hass, 'colorTextValuesHint'),
        'color_text',
        this._config.color_text ?? '#1c1c1c',
        this._config.color_text != null,
      ),
      this._colorRow(
        t(hass, 'colorDimLabel'),
        t(hass, 'colorDimHint'),
        'color_dim',
        effectiveDim,
        this._config.color_dim != null,
      ),
    ));

    form.appendChild(this._row(
      t(hass, 'editorAppearance'),
      t(hass, 'editorAppearanceHint'),
      { select: { mode: 'dropdown', options: [
        { value: 'auto',  label: t(hass, 'appearanceAuto') },
        { value: 'light', label: t(hass, 'appearanceLight') },
        { value: 'dark',  label: t(hass, 'appearanceDark') },
      ] } },
      'appearance',
      this._config.appearance || 'auto',
    ));
  }
}

customElements.define('lutarym-energy-card-editor', LutarymEnergyCardEditor);

// ── Registration for HACS / "Add Card" dialog ──────────────────

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lutarym-energy-card',
  name: 'Energy Card by Lutarym',
  description: 'Monthly bar chart (self-sufficiency, power consumption, PV, wallbox, heat pump, air conditioning) — current year vs. previous years.',
});
