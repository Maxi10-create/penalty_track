# Strafenkasse ASV Natz

Handy-optimierte Web-App für die Strafenkasse des ASV Natz.
Läuft als statische Seite auf GitHub Pages, Daten liegen in Google Sheets (Apps Script als API).

Live: https://maxi10-create.github.io/penalty_track/

## Aufbau

| Pfad | Zweck |
| --- | --- |
| `index.html` | App-Hülle |
| `assets/js/app.js` | gesamte App-Logik (ohne externe Bibliotheken) |
| `assets/css/app.css` | Design (dunkel, Vereinsgrün) |
| `assets/img/` | Logos |
| `manifest.webmanifest` | „Zum Home-Bildschirm“ als App |
| `apps_script/Code.gs` | API für Google Sheets |
| `tools/excel-vorlage/` | alte Excel-Lösung, nur Referenz |

Architektur: [ARCHITECTURE.md](ARCHITECTURE.md)

## Funktionen

- **Übersicht:** Strafen gesamt, bezahlt/offen, Top-Sünder, letzte Einträge
- **Strafe erfassen (+):** Spieler antippen, Strafe antippen, Datum, speichern (mehrere Spieler in einem Rutsch)
- **Auswertung:** Verlauf für 4 Wochen / Saison / Gesamt, Prognose bis Saisonende (30.06.), häufigste Vergehen, Ranking
- **Spieler:** Suche, offene Beträge, Detailansicht mit „bezahlt/offen“ pro Strafe
- **Mehr:** Strafenkatalog, Kader, CSV-Export, An-/Abmelden

Spieler können alles ansehen. Ändern darf nur, wer die 4-stellige Admin-PIN kennt; sie wird im Apps Script geprüft und steht nicht im Quelltext. Nach 5 Fehlversuchen ist der Admin-Login 15 Minuten gesperrt.

## Apps Script einrichten / aktualisieren

1. Google Sheet öffnen → Erweiterungen → Apps Script → Inhalt von `apps_script/Code.gs` einfügen und speichern.
2. Projekteinstellungen → Script-Properties:
   - `API_KEY` (bleibt wie bisher, steht in `assets/js/app.js`)
   - `ADMIN_PASSWORD` = Admin-PIN (genau 4 Ziffern, z. B. `4711`)
3. Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version „Neue Version“ → Bereitstellen.
   So bleibt die `/exec`-URL gleich.

Das Script ergänzt im Blatt `Daten` automatisch die Spalten `paid` und `paidAt`.
