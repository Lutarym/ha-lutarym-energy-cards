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
