# Lutarym HA Cards

Sammlung eigener Lovelace Custom Cards für Home Assistant, rund um Energie-
und Hausautomatisierungs-Dashboards. Fünf eigenständige Cards, jede mit
eigenem Custom-Element-Typ:

| Datei | Typ | Beschriftung in HA |
|---|---|---|
| `lutarym-energy-card.js` | `custom:lutarym-energy-card` | Energy Card by Lutarym |
| `strom-uebersicht-card.js` | `custom:strom-uebersicht-card` | Strom-Übersicht by Lutarym |
| `raum-energie-card.js` | `custom:raum-energie-card` | Raum-Energie by Lutarym |
| `wallbox-card.js` | `custom:wallbox-card` | Wallbox by Lutarym |
| `battery-card.js` | `custom:battery-card` | BYD Battery by Lutarym |

## Installation über HACS

1. HACS → **Frontend** → **⋮** (oben rechts) → **Benutzerdefinierte Repositories**
2. Repository-URL: `https://github.com/<dein-github-name>/ha-lutarym-energy-cards`
   Kategorie: **Dashboard**
3. Nach dem Hinzufügen: "Lutarym HA Cards" installieren — das lädt **alle**
   fünf `.js`-Dateien herunter
4. HA neu laden (Browser-Cache ggf. leeren)

**Wichtig:** HACS trägt automatisch nur die Hauptdatei
(`lutarym-energy-card.js`) als Dashboard-Ressource ein. Die vier anderen
Cards musst du danach einmalig manuell als weitere Ressourcen eintragen:

**Einstellungen → Dashboards → Ressourcen (⋮ oben rechts) → Ressource hinzufügen:**

```yaml
resources:
  - url: /local/community/ha-lutarym-energy-cards/lutarym-energy-card.js
    type: module
  - url: /local/community/ha-lutarym-energy-cards/strom-uebersicht-card.js
    type: module
  - url: /local/community/ha-lutarym-energy-cards/raum-energie-card.js
    type: module
  - url: /local/community/ha-lutarym-energy-cards/wallbox-card.js
    type: module
  - url: /local/community/ha-lutarym-energy-cards/battery-card.js
    type: module
```

(Pfad kann je nach HACS-Version leicht abweichen — im Zweifel im
Datei-Editor unter `config/www/community/ha-lutarym-energy-cards/` nachsehen.)

## Manuelle Installation (ohne HACS)

Alle gewünschten `.js`-Dateien nach `config/www/` kopieren und einzeln in
den Dashboard-Ressourcen eintragen:

```yaml
resources:
  - url: /local/lutarym-energy-card.js
    type: module
  - url: /local/strom-uebersicht-card.js
    type: module
  - url: /local/raum-energie-card.js
    type: module
  - url: /local/wallbox-card.js
    type: module
  - url: /local/battery-card.js
    type: module
```

---

## 1. Energy Card by Lutarym

Monatliche Balkendiagramme (aktuelles Jahr vs. bis zu 3 Vorjahre) für
Autarkie, Stromverbrauch, PV Ertrag, Wallbox, Wärmepumpe und Klimaanlage.
Eine einzige Card, der Kartentyp wird über eine grafische
Konfigurationsmaske ausgewählt.

```yaml
type: custom:lutarym-energy-card
card_type: pv            # autarkie | energy | pv | wallbox | wp | klima
years_back: 2             # optional: 0 | 1 | 2 | 3 — zusätzliche Vorjahre (Standard: 1)
color: "#f59e0b"         # optional, Hauptfarbe aktuelles Jahr
color_prev: "#888888"    # optional, Farbe unmittelbares Vorjahr
color_text: "#1c1c1c"    # optional, Text-/Wertefarbe (Standard: folgt Theme)
color_dim: "#f59e0b55"   # optional, schwächerer Farbton (vergangene Monate, aktuelles Jahr)
appearance: auto         # optional: auto | light | dark
title_font_size: 14       # optional, Standard 14px
label_font_size: 10       # optional, Standard: automatisch
```

### Presets

| card_type | Standard-Entity | Titel | Farbe |
|---|---|---|---|
| autarkie | sensor.autarkie | Autarkie | `#22c55e` |
| energy | sensor.stromverbrauch | Stromverbrauch | `#00b4d8` |
| pv | sensor.pv_ertrag | PV Ertrag | `#f59e0b` |
| wallbox | sensor.wallbox | Wallbox | `#3b82f6` |
| wp | sensor.waermepumpe | Wärmepumpe | `#ef4444` |
| klima | sensor.klimaanlage | Klimaanlage | `#06b6d4` |

Die Standard-Entities sind Platzhalter — im Editor die tatsächliche
Entity-ID eintragen.

## 2. Strom-Übersicht by Lutarym

Jahresverbrauch per Zählerstand-Differenz (1.1. bis heute), Vorjahresvergleich,
Stromkosten inkl. Grundgebühr, optionale Hochrechnung aufs Jahresende.

```yaml
type: custom:strom-uebersicht-card
energy_entity: sensor.haus_strom_energie   # PFLICHT
price_per_kwh: 0.32                         # PFLICHT
base_fee_yearly: 150                        # optional: Jahres-Grundgebühr EUR
base_fee_monthly: 12.5                      # optional: alternativ monatlich EUR
base_fee_mode: accrued                      # "accrued" = tagesanteilig (Standard) | "full"
currency: EUR                               # optional (Standard: EUR)
show_forecast: false                        # optional: Hochrechnung Jahresende
previous_year_kwh: 4200                     # optional: manueller Vorjahreswert
title: Stromübersicht                       # optional
```

## 3. Raum-Energie by Lutarym

Jahresverbrauch des Gesamthauses und einzelner Räume mit prozentualem
Anteil am Gesamtverbrauch (bis zu 10 Räume).

```yaml
type: custom:raum-energie-card
title: Stromverbrauch Räume                # optional
total_entity: sensor.haus_strom_energie    # PFLICHT: Gesamt-kWh-Zähler
rooms:                                     # PFLICHT: 1-10 Räume
  - name: Wohnzimmer
    entity: sensor.wohnzimmer_energie_kwh
  - name: Küche
    entity: sensor.kueche_energie_kwh
  - name: Büro
    entity: sensor.buero_energie_kwh
```

## 4. Wallbox by Lutarym

Ladeleistung, Ladestrom, geladene Energie, Verbindungsstatus, optional
Start/Stop-Schalter und Kosten der aktuellen Ladung.

```yaml
type: custom:wallbox-card
power_entity: sensor.wallbox_ladeleistung      # PFLICHT (W oder kW)
current_entity: sensor.wallbox_ladestrom       # optional (A)
energy_entity: sensor.wallbox_energie_session  # optional (kWh, Session/heute)
plug_entity: binary_sensor.wallbox_verbunden   # optional (Stecker erkannt)
status_entity: sensor.wallbox_status           # optional (Text-Status, hat Vorrang)
switch_entity: switch.wallbox_laden            # optional (Start/Stop-Button)
price_per_kwh: 0.32                            # optional: Kosten der Session
currency: EUR                                  # optional (Standard: EUR)
idle_threshold_w: 50                           # optional: ab wann "lädt" (Standard 50 W)
title: Wallbox                                  # optional
```

## 5. BYD Battery by Lutarym

Animierte Batteriestandsanzeige mit Farbverlauf und wählbarem
Animationsstil (14 Modi: Wellen, Blasen, Glitzer, Blitz, Regen, Matrix u.a.).

```yaml
type: custom:battery-card
entity: sensor.byd_battery_box_premium_hv_ladezustand  # PFLICHT
height: 60           # optional, Standard 60px
width: 28             # optional, Standard: automatisch aus height berechnet
animation: 0          # optional, 0-12, Standard 0 (statisch)
name: BYD Batteriestand  # optional
show_name: true       # optional
show_percent: true    # optional
percent_size: 15       # optional, Schriftgröße Prozentanzeige
```

## Lizenz

Privat / persönlicher Gebrauch.
