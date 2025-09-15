---
title: Penalty Track (Static)
emoji: 📦
colorFrom: blue
colorTo: green
sdk: static
app_file: index.html
---

## Deployment (GitHub Pages)
1. Settings → Pages → Source = Deploy from a branch → Branch = main, Folder = /(root) → Save
2. Auf die erzeugte URL gehen (z. B. https://maxi10-create.github.io/penalty_track/)
3. Oben in der App API URL (…/exec), API Key und optional Admin Key eintragen → Speichern

# penalty_track

Statische HTML-App mit Google Sheets als Backend. Zwei Rollen: **Admin** (CRUD inkl. Löschen) und **Spieler** (Create + Read).

## Funktionen

- ✅ **Formular**: Name/Wert/Kategorie/Zeit erfassen
- ✅ **Liste**: Alle Einträge anzeigen, sortiert nach Datum
- ✅ **Reload**: Daten neu laden
- ✅ **CSV-Export**: Lokaler Download aller Daten
- ✅ **Rollenbasiert**: Admin kann löschen, Spieler nur erstellen/lesen
- ✅ **Sicherheit**: API-Key Authentication über Google Apps Script

## Sicherheit

- API-Keys werden nur im Browser localStorage gespeichert (nicht im Repository)
- Google Apps Script validiert alle Requests
- Admin-Funktionen sind durch separaten Admin-Key geschützt
- Keine Server-Kosten, vollständig serverlos