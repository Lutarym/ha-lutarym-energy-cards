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
