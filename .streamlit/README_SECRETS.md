# Streamlit Secrets

In Streamlit Cloud unter **App → Settings → Secrets** diesen Eintrag setzen:

```toml
DB_URL="postgresql+psycopg2://USER:PASSWORD@HOST/DBNAME?sslmode=require&channel_binding=require"
```

**Achtung:** Secrets niemals ins Repo committen!