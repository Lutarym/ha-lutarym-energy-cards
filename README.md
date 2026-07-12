# Energy Card by Lutarym

Lovelace Custom Card für Home Assistant — monatliche Balkendiagramme
(aktuelles Jahr vs. bis zu 3 Vorjahre) für Autarkie, Stromverbrauch,
PV Ertrag, Wallbox, Wärmepumpe und Klimaanlage. Eine Card, der Kartentyp
wird über eine grafische Konfigurationsmaske ausgewählt.

## Installation über HACS

1. HACS → Frontend → **⋮** → Benutzerdefinierte Repositories
2. Repository-URL dieses Repos eintragen, Kategorie **Dashboard**
3. "Energy Card by Lutarym" installieren
4. HA neu laden (Browser-Cache ggf. leeren)

## Manuelle Installation

`lutarym-energy-card.js` nach `config/www/` kopieren:

```yaml
resources:
  - url: /local/lutarym-energy-card.js
    type: module
```

## Verwendung

Über **Dashboard bearbeiten → Karte hinzufügen → "Energy Card by Lutarym"**
hinzufügen — öffnet direkt die grafische Konfigurationsmaske.

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

## Lizenz

Privat / persönlicher Gebrauch.
