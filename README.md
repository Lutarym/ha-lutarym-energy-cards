# Energy Card by Lutarym

Lovelace Custom Card für Home Assistant — monatliche Balkendiagramme
(aktuelles Jahr vs. Vorjahre) für:

- Autarkie
- Stromverbrauch
- PV Ertrag
- Wallbox Ladung
- Wärmepumpe
- Klimaanlage

Eine einzige Card (`lutarym-energy-card`), der Typ wird über eine grafische
Konfigurationsmaske ausgewählt — kein manuelles YAML nötig.

## Installation über HACS

1. HACS → **Frontend** → **⋮** (oben rechts) → **Benutzerdefinierte Repositories**
2. Repository-URL: `https://github.com/<dein-github-name>/ha-lutarym-energy-cards`
   Kategorie: **Lovelace**
3. Nach dem Hinzufügen: "Lutarym Energy Cards" installieren
4. HA neu laden (Browser-Cache ggf. leeren)

## Manuelle Installation (ohne HACS)

1. `lutarym-energy-card.js` nach `config/www/` kopieren
2. In den Dashboard-Ressourcen eintragen:

   ```yaml
   resources:
     - url: /local/lutarym-energy-card.js
       type: module
   ```

## Verwendung

Karte über **Dashboard bearbeiten → Karte hinzufügen → "Monthly Bar Card"**
hinzufügen. Im Editor lässt sich der Kartentyp per Dropdown wählen; Entity,
Titel und Farbe können optional überschrieben werden (sonst gelten die
Presets).

Alternativ per YAML:

```yaml
type: custom:lutarym-energy-card
card_type: pv           # autarkie | energy | pv | wallbox | wp | klima
years_back: 2            # optional: 1 | 2 | 3 — zusätzliche Vorjahre (Standard: 1)
color: "#f59e0b"        # optional, Hauptfarbe aktuelles Jahr
color_prev: "#888888"   # optional, Farbe unmittelbares Vorjahr (weiter zurückliegende Jahre werden automatisch blasser dargestellt)
color_text: "#1c1c1c"   # optional, Text-/Wertefarbe (Standard: folgt Dashboard-Theme)
color_dim: "#f59e0b55"  # optional, schwächerer Farbton für vergangene Monate (aktuelles Jahr)
appearance: auto        # optional: auto | light | dark
```

## Mehrjahresvergleich

Mit `years_back` lässt sich einstellen, wie viele zusätzliche Vorjahre neben
dem aktuellen Jahr als Balken angezeigt werden (0 bis 3, Standard: 1). Bei
`0` wird ausschließlich das aktuelle Jahr angezeigt, ganz ohne
Vergleichsbalken. Das unmittelbare Vorjahr nutzt `color_prev` in voller
Deckkraft, weiter zurückliegende Jahre werden automatisch zunehmend blasser
dargestellt, um optisch zwischen den Jahren zu unterscheiden.

## Darstellung (Hell/Dunkel)

`appearance: auto` (Standard) folgt automatisch dem aktiven Dashboard-Theme.
Mit `light` bzw. `dark` lässt sich für eine einzelne Karte unabhängig vom
Dashboard-Theme ein festes Hell- bzw. Dunkel-Farbschema erzwingen.

## Presets

| card_type  | Standard-Entity        | Titel            | Farbe     |
|------------|-------------------------|------------------|-----------|
| autarkie   | sensor.autarkie          | Autarkie         | `#22c55e` |
| energy     | sensor.stromverbrauch    | Stromverbrauch   | `#00b4d8` |
| pv         | sensor.pv_ertrag         | PV Ertrag        | `#f59e0b` |
| wallbox    | sensor.wallbox           | Wallbox          | `#3b82f6` |
| wp         | sensor.waermepumpe       | Wärmepumpe       | `#ef4444` |
| klima      | sensor.klimaanlage       | Klimaanlage      | `#06b6d4` |

Die Standard-Entities sind Platzhalter — trag im Editor deine tatsächliche
Entity-ID ein (Feld "Entity"), bevor die Karte Daten anzeigt.

## Lizenz

Privat / persönlicher Gebrauch.
