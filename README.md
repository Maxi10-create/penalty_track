# Strafenkasse ASV Natz

Handy-optimierte Web-App für die Strafenkasse des ASV Natz.
Läuft als statische Seite auf GitHub Pages, Daten liegen in Google Sheets (Apps Script als API).

Live: https://maxi10-create.github.io/penalty_track/

## Aufbau

| Datei | Zweck |
| --- | --- |
| `index.html` | App-Hülle |
| `assets/app.js` | gesamte App-Logik (ohne externe Bibliotheken) |
| `assets/app.css` | Design (dunkel, Vereinsgrün) |
| `manifest.webmanifest` | „Zum Home-Bildschirm“ als App |
| `apps_script/Code.gs` | API für Google Sheets |

## Funktionen

- **Übersicht:** Strafen gesamt, bezahlt/offen, Top-Sünder, letzte Einträge
- **Strafe erfassen (+):** Spieler antippen, Strafe antippen, Datum, speichern (mehrere Spieler in einem Rutsch)
- **Auswertung:** Verlauf für 4 Wochen / Saison / Gesamt, Prognose bis Saisonende (30.06.), häufigste Vergehen, Ranking
- **Spieler:** Suche, offene Beträge, Detailansicht mit „bezahlt/offen“ pro Strafe
- **Mehr:** Strafenkatalog, Kader, CSV-Export, An-/Abmelden

Spieler können alles ansehen. Ändern darf nur, wer das Admin-Passwort kennt; das Passwort wird im Apps Script geprüft und steht nicht im Quelltext.

## Apps Script einrichten / aktualisieren

1. Google Sheet öffnen → Erweiterungen → Apps Script → Inhalt von `apps_script/Code.gs` einfügen und speichern.
2. Projekteinstellungen → Script-Properties:
   - `API_KEY` (bleibt wie bisher, steht in `assets/app.js`)
   - `ADMIN_PASSWORD` = neues Admin-Passwort
3. Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version „Neue Version“ → Bereitstellen.
   So bleibt die `/exec`-URL gleich.

Das Script ergänzt im Blatt `Daten` automatisch die Spalten `paid` und `paidAt`.
