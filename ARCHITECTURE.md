# Zielarchitektur – Strafenkasse ASV Natz

## Zweck
Mobile Web-App (PWA) für die Strafenkasse der Mannschaft: Strafen erfassen, offene Beträge verfolgen, Auswertung und Prognose bis Saisonende. Spieler lesen, nur Admins (PIN) schreiben.

## Systemübersicht

```
┌──────────────────────────┐  GET  ?apiKey&view=all  ┌──────────────────────┐   ┌───────────────┐
│ PWA (GitHub Pages)       │ ──────────────────────▶ │ Apps Script Web-App  │──▶│ Google Sheet  │
│ index.html + assets/     │  POST apiKey+adminKey   │ apps_script/Code.gs  │   │ Daten/Players/│
│ manifest.webmanifest     │ ◀────────── JSON ────── │ CacheService (Chunks)│   │ Fines         │
└──────────────────────────┘                         └──────────────────────┘   └───────────────┘
```

| Schicht | Technik | Verantwortung |
|---|---|---|
| Frontend | Vanilla JS, keine Bibliotheken, PWA-Manifest | UI, Auswertung, Prognose, CSV-Export |
| API | Apps Script (`doGet` lesen, `doPost` schreiben) | Auth, CRUD, Cache |
| Daten | Google Sheet | `Daten` (Einträge), `Players` (Kader), `Fines` (Katalog) |

## API

| Aktion | Methode | Recht |
|---|---|---|
| `view=all` | GET | API-Key (öffentlich, nur lesen) |
| `check_admin` | POST | Admin-PIN |
| `add_entries`, `delete_entry`, `set_paid` | POST | Admin-PIN |
| `upsert_player`, `delete_player` | POST | Admin-PIN |
| `upsert_fine`, `delete_fine` | POST | Admin-PIN |

## Sicherheit
- `API_KEY` steht bewusst im Frontend und erlaubt nur Lesen.
- Admin-PIN (4 Ziffern) liegt nur in den Script-Properties; 5 Fehlversuche → 15 Min. Sperre.
- Cache-Schlüssel an `CODE_VERSION` gekoppelt – nach Änderungen am Lesen erhöhen.

## Repo-Struktur

```
penalty_track/
├─ index.html              App-Hülle (GitHub Pages)
├─ manifest.webmanifest
├─ assets/
│  ├─ css/app.css
│  ├─ js/app.js
│  └─ img/                 Logos
├─ apps_script/Code.gs
├─ tools/excel-vorlage/    Alte Excel-Lösung (Generator + Vorlage), nur Referenz
├─ ARCHITECTURE.md
└─ README.md
```

## Konventionen
- Cache-Busting über `?v=` in `index.html`, bei jeder Änderung hochzählen.
- Apps Script: nach jeder Änderung neue Version unter derselben Bereitstellung (URL bleibt).
- Keine Echtdaten-Exporte im Repo.

## Zielzustand (offene Schritte)
| # | Schritt | Nutzen |
|---|---|---|
| 1 | Service Worker für Offline-Start ergänzen (PWA vollständig) | App startet ohne Netz |
| 2 | `app.js` in Module trennen (`api.js`, `views/*.js`, `stats.js`) | Wartbarkeit |
| 3 | `tools/excel-vorlage/` entfernen, sobald die Excel-Lösung nicht mehr gebraucht wird | schlankes Repo |
| 4 | Apps Script per `clasp` deployen | reproduzierbare Deploys |
