import os, streamlit as st
from sqlalchemy import create_engine, text

st.set_page_config(page_title="Penalty Tracker", page_icon="📦", layout="centered")

# DB-Verbindung: erst Secrets, dann Env, sonst lokale SQLite
try:
    DB_URL = st.secrets.get("DB_URL") or os.getenv("DB_URL") or "sqlite:///./local_dev.db"
except:
    DB_URL = os.getenv("DB_URL") or "sqlite:///./local_dev.db"
engine = create_engine(DB_URL, pool_pre_ping=True)

# Tabelle anlegen (idempotent)
INIT_SQL = """
CREATE TABLE IF NOT EXISTS entries(
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  value text NOT NULL,
  ts timestamptz DEFAULT CURRENT_TIMESTAMP
);
"""
with engine.begin() as conn:
    conn.execute(text(INIT_SQL))

st.title("📦 Penalty Tracker")
name = st.text_input("Name")
value = st.text_area("Wert")

if st.button("Speichern", type="primary") and name and value:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO entries(name, value) VALUES (:n, :v)"),
                     {"n": name, "v": value})
    st.success("Gespeichert!")

st.subheader("Letzte Einträge")
with engine.begin() as conn:
    rows = conn.execute(text("SELECT name, value, ts FROM entries ORDER BY ts DESC LIMIT 100")).all()
for r in rows:
    st.write(f"**{r.name}** – {r.value}")
    st.caption(str(r.ts))