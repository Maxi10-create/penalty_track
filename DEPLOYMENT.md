# ASV Natz Penalty Tracker - Cloudflare Workers Deployment

Diese Anleitung zeigt dir, wie du die ASV Natz Penalty Tracking App auf Cloudflare Workers (Free-Tier) bereitstellst.

## Voraussetzungen

1. **Cloudflare Account** (kostenlos): https://dash.cloudflare.com/sign-up
2. **Node.js** installiert (v16 oder höher)
3. **Wrangler CLI** installiert: `npm install -g wrangler`

## Setup Schritte

### 1. Cloudflare Login
```bash
wrangler login
```

### 2. D1 Datenbank erstellen
```bash
wrangler d1 create asv-natz-penalties
```

**Wichtig:** Kopiere die generierte Database ID in die `wrangler.toml` Datei:
```toml
[[d1_databases]]
binding = "DB"
database_name = "asv-natz-penalties"
database_id = "DEINE-DATABASE-ID-HIER"
```

### 3. Datenbank Schema initialisieren
```bash
# Schema erstellen
wrangler d1 execute asv-natz-penalties --file=schema.sql

# Beispieldaten laden (Spieler & Vergehen)
wrangler d1 execute asv-natz-penalties --file=seed.sql
```

### 4. Dependencies installieren
```bash
npm install hono
```

### 5. Lokale Entwicklung
```bash
wrangler dev
```

### 6. Produktions-Deployment
```bash
wrangler deploy
```

## Cloudflare Free-Tier Limits

- **Workers**: 100.000 Requests/Tag (kostenlos)
- **D1**: 
  - 5GB Storage (kostenlos)
  - 25 Millionen Reads/Monat
  - 50.000 Writes/Monat

## Funktionen

✅ **Dashboard** - KPIs und Übersicht der Strafen
✅ **Strafen hinzufügen** - Dropdowns für Spieler & Vergehen  
✅ **Strafen-Liste** - Alle erfassten Strafen anzeigen
✅ **Statistiken** - Zeitraum-basierte Auswertungen
✅ **Spieler-Verwaltung** - Neue Spieler hinzufügen
✅ **CSV Export** - Datenexport für Excel/LibreOffice
✅ **Responsive UI** - Bootstrap-basierte Oberfläche

## Datenbankstruktur

### Tabellen:
- `players` - Spielerdaten
- `penalty_types` - Vergehen-Katalog mit Beträgen
- `penalties` - Erfasste Strafen (Verknüpft Spieler + Vergehen)

### Automatisch geladen:
- 28 ASV Natz Spieler
- 47 Vergehen mit original Beträgen

## API Endpoints

- `GET /` - Dashboard
- `GET /add` - Strafe hinzufügen (Formular)
- `POST /api/penalties` - Strafe speichern
- `GET /penalties` - Strafen-Liste
- `GET /statistics` - Statistiken
- `GET /api/export/csv` - CSV Download
- `GET /players` - Spieler-Verwaltung
- `POST /api/players` - Spieler hinzufügen

## Support

Die App läuft komplett serverless auf Cloudflare's Edge-Network und ist kostenfrei nutzbar im Free-Tier.

🏆 **Viel Erfolg mit dem ASV Natz Penalty Tracker!**