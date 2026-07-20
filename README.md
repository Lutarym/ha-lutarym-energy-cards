# Energy Card by Lutarym

Lovelace Custom Card for Home Assistant — monthly bar charts (current year
vs. up to 3 previous years) for self-sufficiency, power consumption, PV
yield, wallbox, heat pump, air conditioning, and battery state of charge.
A single card; the card type is chosen via a visual configuration form.
The editor and the card itself are fully bilingual (German/English),
following `hass.language` automatically.

For the battery state of charge, the monthly display can be switched
between a plain average and a min/max range: the bar itself always stays
anchored at 0 (height = monthly mean, exactly like every other card
type), with the monthly min/max overlaid as a whisker — a vertical line
with caps, on the same scale as the bar. No separate number label in
range mode; the exact Ø/min/max figures are in the summary line above
the chart.

## Installation via HACS

1. HACS → Frontend → **⋮** → Custom repositories
2. Enter this repository's URL, category **Dashboard**
3. Install "Energy Card by Lutarym"
4. Reload Home Assistant (clear browser cache if needed)

## Manual installation

Copy `lutarym-energy-card.js` to `config/www/`:

```yaml
resources:
  - url: /local/lutarym-energy-card.js
    type: module
```

## Usage

Add via **Edit Dashboard → Add Card → "Energy Card by Lutarym"** — opens
the visual configuration form directly.

```yaml
type: custom:lutarym-energy-card
card_type: pv            # autarkie | energy | pv | wallbox | wp | klima | akku
years_back: 2             # optional: 0 | 1 | 2 | 3 — additional previous years (default: 1)
stat_mode: mean           # optional, only for "akku": mean | minmax (bar stays at 0, min/max as a whisker, no separate axis)
color: "#f59e0b"         # optional, main color for the current year
color_prev: "#888888"    # optional, color for the immediate previous year
color_text: "#1c1c1c"    # optional, text/value color (default: follows theme)
color_dim: "#f59e0b55"   # optional, muted color (past months, current year)
appearance: auto         # optional: auto | light | dark
title_font_size: 14       # optional, default 14px
label_font_size: 10       # optional, default: automatic
```

### Presets

| card_type | Default entity | Title | Color |
|---|---|---|---|
| autarkie | sensor.autarkie | Self-Sufficiency | `#22c55e` |
| energy | sensor.stromverbrauch | Power Consumption | `#00b4d8` |
| pv | sensor.pv_ertrag | PV Yield | `#f59e0b` |
| wallbox | sensor.wallbox | Wallbox | `#3b82f6` |
| wp | sensor.waermepumpe | Heat Pump | `#ef4444` |
| klima | sensor.klimaanlage | Air Conditioning | `#06b6d4` |
| akku | sensor.akku_ladezustand | Battery State of Charge | `#a855f7` |

The default entities are placeholders — enter your actual entity ID in
the editor.

## License

Private / personal use.
