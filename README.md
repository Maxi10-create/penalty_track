---
title: Penalty Track (Static)
emoji: 📦
colorFrom: blue
colorTo: green
sdk: static
app_file: index.html
---

# Penalty Track (HTML + Google Sheets)

- **Start:** Spieler/Admin Auswahl (Admin-Passwort: `admin2024`, Spieler: nur Klick; intern `2024`)
- **Tab 1:** Dashboard (Pott Summe €, Top 3, Chart kumuliert)
- **Tab 2:** Detail pro Spieler
- **Tab 3:** Erfassung (Admin) – Multi-Spieler + Strafe + Zeit
- **Tab 4:** Stammdaten (Admin) – Spieler & Strafen verwalten

## Einrichtung
1) Google Sheet + Apps Script → `apps_script/Code.gs` in den Editor kopieren  
   - Script Properties: `API_KEY`, `ADMIN_KEY` setzen  
   - **Deploy → Web App** (Anyone with link) → `/exec` URL kopieren  
2) GitHub Pages: Settings → Pages → Deploy from branch (`main`/root)  
3) App öffnen → ⚙️ Konfiguration: API URL, API Key, (optional) Admin Key eintragen