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
