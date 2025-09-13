# penalty_track

## Deployment (kostenlos)

1. **Streamlit Cloud**: Repo verknüpfen, Entry-File `streamlit_app.py` wählen.
2. **Secrets**: In Streamlit Cloud Settings:

```toml
DB_URL="postgresql+psycopg2://…"
```

3. **GitHub Actions**: In Repo Settings → Secrets → Actions: `DB_URL` mit demselben Wert anlegen.
4. **Backups**: Täglich via GitHub Action (`db-backup.yml`).
5. **Keep-Warm** (optional): `ping.yml` ruft App täglich auf.