# Lutarym Energy Cards

Lovelace Custom Card für Home Assistant — monatliche Balkendiagramme
(aktuelles Jahr vs. Vorjahr) für:

- Autarkie
- Stromverbrauch
- PV Ertrag
- Wallbox Ladung
- Wärmepumpe
- Klimaanlage

Eine einzige Card (`monthly-bar-card`), der Typ wird über eine grafische
Konfigurationsmaske ausgewählt — kein manuelles YAML nötig.

## Installation über HACS

1. HACS → **Frontend** → **⋮** (oben rechts) → **Benutzerdefinierte Repositories**
2. Repository-URL: `https://github.com/<dein-github-name>/ha-lutarym-energy-cards`
   Kategorie: **Lovelace**
3. Nach dem Hinzufügen: "Lutarym Energy Cards" installieren
4. HA neu laden (Browser-Cache ggf. leeren)

## Manuelle Installation (ohne HACS)

1. `monthly-bar-card.js` nach `config/www/` kopieren
2. In den Dashboard-Ressourcen eintragen:

   ```yaml
   resources:
     - url: /local/monthly-bar-card.js
       type: module
   ```

## Verwendung

Karte über **Dashboard bearbeiten → Karte hinzufügen → "Monthly Bar Card"**
hinzufügen. Im Editor lässt sich der Kartentyp per Dropdown wählen; Entity,
Titel und Farbe können optional überschrieben werden (sonst gelten die
Presets).

Alternativ per YAML:

```yaml
type: custom:monthly-bar-card
card_type: pv   # autarkie | energy | pv | wallbox | wp | klima
```

## Presets

| card_type  | Standard-Entity                              | Titel            | Farbe     |
|------------|-----------------------------------------------|------------------|-----------|
| autarkie   | sensor.fronius_portal_autarkiegrad            | Autarkie         | `#22c55e` |
| energy     | sensor.haus_strom_energie                     | Stromverbrauch   | `#00b4d8` |
| pv         | sensor.fronius_portal_pv_energie_gesamt       | PV Ertrag        | `#f59e0b` |
| wallbox    | sensor.wallbox_energie_gesamt                 | Wallbox Ladung   | `#3b82f6` |
| wp         | sensor.warmepumpe_energie                     | Wärmepumpe       | `#ef4444` |
| klima      | sensor.klimaanlage_energie                    | Klimaanlage      | `#06b6d4` |

## Lizenz

Privat / persönlicher Gebrauch.
