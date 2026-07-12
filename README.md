# Lutarym HA Cards

Sammlung eigener Lovelace Custom Cards für Home Assistant, rund um Energie-
und Hausautomatisierungs-Dashboards. Fünf eigenständige Cards, jede mit
eigenem Custom-Element-Typ und eigenem visuellen Editor — gebündelt in
**einer** Datei (`lutarym-ha-cards.js`), damit die Installation über HACS
zuverlässig funktioniert (die HACS-Kategorie "Dashboard" ist strukturell auf
eine Datei pro Repository ausgelegt; mehrere separate Dateien werden dort
nicht zuverlässig automatisch mitgeladen):

| Typ | Beschriftung in HA |
|---|---|
| `custom:lutarym-energy-card` | Energy Card by Lutarym |
| `custom:strom-uebersicht-card` | Strom-Übersicht by Lutarym |
| `custom:raum-energie-card` | Raum-Energie by Lutarym |
| `custom:wallbox-card` | Wallbox by Lutarym |
| `custom:battery-card` | BYD Battery by Lutarym |

Alle fünf Cards haben eine grafische Konfigurationsmaske (visueller Editor)
— beim Hinzufügen über **Dashboard bearbeiten → Karte hinzufügen** öffnet
sich direkt ein Formular, YAML ist nirgends nötig.

Die einzelnen Quelldateien (`lutarym-energy-card.js`, `strom-uebersicht-card.js`
usw.) liegen weiterhin separat im Repo zum Lesen/Bearbeiten — für die
Auslieferung an Home Assistant zählt aber nur `lutarym-ha-cards.js`.

## Installation über HACS

1. HACS → **Frontend** → **⋮** (oben rechts) → **Benutzerdefinierte Repositories**
2. Repository-URL: `https://github.com/<dein-github-name>/ha-lutarym-energy-cards`
   Kategorie: **Dashboard**
3. Nach dem Hinzufügen: "Lutarym HA Cards" installieren — lädt genau eine
   Datei (`lutarym-ha-cards.js`), die automatisch als Ressource eingetragen wird
4. HA neu laden (Browser-Cache ggf. leeren)

Das war's — keine weiteren manuellen Ressourcen-Einträge nötig, alle fünf
Cards stehen danach im "Karte hinzufügen"-Dialog zur Verfügung.

## Manuelle Installation (ohne HACS)

`lutarym-ha-cards.js` nach `config/www/` kopieren und eintragen:

```yaml
resources:
  - url: /local/lutarym-ha-cards.js
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
Stromkosten inkl. Grundgebühr, optionale Hochrechnung aufs Jahresende. Der
Vorjahresverbrauch wird automatisch aus der Entity-Statistik berechnet;
`previous_year_kwh` überschreibt das nur bei Bedarf manuell (z.B. wenn für
das Vorjahr keine vollständigen historischen Daten vorliegen). Im
visuellen Editor wird der Preis in **Cent pro kWh** eingegeben (deutsche
Konvention) und intern automatisch in Euro umgerechnet.

```yaml
type: custom:strom-uebersicht-card
energy_entity: sensor.haus_strom_energie   # PFLICHT
price_per_kwh: 0.32                         # PFLICHT (Euro/kWh; Editor zeigt Cent/kWh)
base_fee_yearly: 150                        # optional: Jahres-Grundgebühr EUR (hat Vorrang vor monatlich)
base_fee_monthly: 12.5                      # optional: alternativ monatlich EUR
base_fee_mode: accrued                      # "accrued" = tagesanteilig (Standard) | "full"
currency: EUR                               # optional (Standard: EUR)
show_forecast: false                        # optional: Hochrechnung Jahresende
previous_year_kwh: 4200                     # optional: manueller Vorjahreswert (überschreibt Automatik)
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
