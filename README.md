# Energy Card by Lutarym

Lovelace Custom Card for Home Assistant — monthly bar charts (current year
vs. up to 3 previous years) for self-sufficiency, power consumption, PV
yield, wallbox, heat pump, air conditioning, and battery state of charge.
A single card; the card type is chosen via a visual configuration form.
The editor and the card itself are fully bilingual (German/English),
following `hass.language` automatically.

For heat pump energy, an optional outdoor-temperature entity can be set to
draw a temperature line on its own right-hand °C scale (unlike kW, this
axis has a real min *and* max, since winter months regularly go
negative). The display resolution is chosen via `temp_mode`:

- `daily` (default) — one point per calendar day, matching what you'd see
  in Home Assistant's own history graph. Automatically simplifies to a
  monthly min/max band below ~500px card width, then to a plain monthly
  average line below ~280px — computed from the same daily data, no
  extra network request.
- `minmax` — a monthly min/max band plus a mean line, always.
- `mean` — a plain monthly average line, always.

For PV yield, an optional installed capacity (kWp) can be set — this
draws a dashed reference line across the chart, read against its own
scale on the right (kW isn't the same unit as the kWh bars, so a
second axis genuinely earns its place here, unlike the min/max case
above).

Additionally, an optional *power* entity (kW/W, `state_class:
measurement` — e.g. the inverter's current AC power) can be set to show
the actual monthly peak: a short tick on top of each bar, on the same
right-hand kW axis as the kWp line. This needs a **separate** entity
from the yield sensor above — the yield sensor is a cumulative energy
counter (kWh), which only has a meaningful `sum` per month; only an
instantaneous power sensor has a meaningful monthly `max`.

For the battery state of charge, the monthly display can be switched
between a plain average and a min/max range: the bar itself always stays
anchored at 0 (height = monthly mean, exactly like every other card
type), with the monthly min/max overlaid as a whisker — a vertical line
with caps, on the same scale as the bar. No separate number label in
range mode; the exact Ø/min/max figures are in the summary line above
the chart.

Hovering a bar with the mouse shows a small tooltip with month, year, and
the exact value (Ø with min/max range in the akku min/max mode; peak
power ticks on the pv preset show their own value too).

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
card_type: pv            # autarkie | energy | pv | wallbox | wp | klima | akku | einspeisung
years_back: 2             # optional: 0 | 1 | 2 | 3 — additional previous years (default: 1)
show_values: true         # optional — the number above each bar (not the axis scale), default: true, all card types
stat_mode: mean           # optional, only for "akku": mean | minmax (bar stays at 0, min/max as a whisker, no separate axis)
kwp: 14.4                 # optional, only for "pv": installed capacity — draws a dashed reference line vs. a second right-hand kW scale
power_entity: sensor.xyz  # optional, only for "pv": instantaneous power sensor — shows the monthly peak as a tick per bar
temperature_entity: sensor.aussentemperatur # optional, only for "wp": outdoor temp — draws a temperature line
temp_mode: daily          # optional, only for "wp" with temperature_entity: daily | minmax | mean (default: daily)
color_temp: "#0ea5e9"     # optional, temperature line color (default: sky blue)
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
| einspeisung | *(none — select your own)* | PV Netz-Einspeisung | `#ec4899` |

The default entities are placeholders — enter your actual entity ID in
the editor. `einspeisung` has no default at all, since a guessed sensor
name would never match a real setup; the card shows a short "select an
entity" hint until one is configured.

## License

Private / personal use.
