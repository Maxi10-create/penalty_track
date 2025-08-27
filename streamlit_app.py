#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ASV Natz Penalty Tracking Streamlit Application
Optimized for Streamlit Cloud deployment
"""

import streamlit as st
import pandas as pd
import sqlite3
from datetime import datetime, date, timedelta
import plotly.express as px
import plotly.graph_objects as go
import io
import os

# Set page config - must be first Streamlit command
st.set_page_config(
    page_title="ASV Natz - Penalty Tracker",
    page_icon="⚽",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Access codes
ACCESS_CODES = {'kassier': '1970'}

# Initialize session state
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'user_role' not in st.session_state:
    st.session_state.user_role = None

def get_db_path():
    """Get database path"""
    return os.path.join(os.getcwd(), 'penalty_tracker.db')

@st.cache_resource
def init_database():
    """Initialize database with default data"""
    db_path = get_db_path()
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create tables
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS player (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS penalty_type (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                amount REAL NOT NULL,
                description TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS penalty (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                player_id INTEGER NOT NULL,
                penalty_type_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES player (id),
                FOREIGN KEY (penalty_type_id) REFERENCES penalty_type (id)
            )
        ''')
        
        # Check if players exist
        cursor.execute('SELECT COUNT(*) FROM player')
        if cursor.fetchone()[0] == 0:
            players = [
                "Maximilian Hofer", "Hannes Peintner", "Alex Braunhofer", "Alex Schraffel",
                "Andreas Fusco", "Armin Feretti", "Hannes Larcher", "Julian Brunner",
                "Leo Tauber", "Lukas Mayr", "Manuel Troger", "Martin Gasser",
                "Matthias Schmid", "Maximilian Schraffl", "Michael Mitterrutzner", "Michael Peintner",
                "Patrick Auer", "Patrick Pietersteiner", "Stefan Filo", "Stefan Peintner",
                "Manuel Auer", "Mauro Monti", "Tobias", "Jakob Unterholzner",
                "Fabian Bacher", "Emil Gabrieli", "Mardochee", "Oleg Schleiermann"
            ]
            
            for player_name in players:
                cursor.execute('INSERT INTO player (name) VALUES (?)', (player_name,))
        
        # Check if penalty types exist
        cursor.execute('SELECT COUNT(*) FROM penalty_type')
        if cursor.fetchone()[0] == 0:
            penalties = [
                ("Unentschuldigtes Fehlen im Trainingslager", 50, ""),
                ("Bier bei Essen Trainingslager", 10, ""),
                ("Busfahrer pflanzen", 5, ""),
                ("Alpha Aktion", 5, ""),
                ("Ball in Q5", 2, ""),
                ("Socken ohschneiden", 20, ""),
                ("Valentinstog fahln", 50, ""),
                ("Abschlussmatch verloren", 2, ""),
                ("Fehlen beim Spiel wegen Urlaub", 30, ""),
                ("Abwesenheit Urlaub während Meisterschaft", 10, ""),
                ("Unentschuldigtes Fehlen Spiel", 50, ""),
                ("Unentschieden Meisterschaftsspiel", 1, ""),
                ("Niederlage Meisterschaftsspiel", 2, ""),
                ("Spiel Socken ohschneiden", 20, ""),
                ("Elfer verursachen", 10, ""),
                ("Unentschuldigtes Fehlen beim Training", 20, ""),
                ("100%ige Chance liegen lossen", 5, ""),
                ("Falscher Einwurf", 5, ""),
                ("Elfer verschiaßn", 10, ""),
                ("Tormonn Papelle kregn", 5, ""),
                ("Freitig glei nochn Training gian", 2, ""),
                ("Schuache in Kabine ohklopfn", 5, ""),
                ("Kistenplan net einholten /pro Kopf", 30, ""),
                ("Übung bei training vertschecken", 1, ""),
                ("Torello 20 Pässe", 2, ""),
                ("Übern tennisplotz mit FB schuach gian", 5, ""),
                ("Nochn training gian ohne eps zu verraumen", 5, ""),
                ("Gelbsperre/Rotsperre pro Spiel", 15, ""),
                ("Kabinendienst vernachlässigt", 10, ""),
                ("Freitags Abschluss-Spiel verloren", 2, ""),
                ("Abwesenheit Urlaub in Vorbereitung", 5, ""),
                ("Glei nochn Hoamspiel gian(min 30 min.)", 10, ""),
                ("Saufn vorn Spiel", 50, ""),
                ("Unsportliches Verhalten gegenüber Mitspieler/Trai", 50, ""),
                ("Erstes Tor/Startelfeinsatz", 0, "Kasten (ansonsten 20€)"),
                ("Eigentor", 0, "Kasten (ansonsten 20€)"),
                ("Foto in Zeitung/Online", 2, ""),
                ("Sachen in Kabine/Platz vergessen", 5, ""),
                ("Unentschuldigtes fehlen beim Training ohne Absage", 15, ""),
                ("Rauchen im Trikot", 15, ""),
                ("Bei Spiel folscher Trainer", 20, ""),
                ("Folsches Trainingsgewond", 5, ""),
                ("Handy leitn in do kabine", 5, ""),
                ("Schiffn in do Dusche", 20, ""),
                ("Oan setzn in do Kabine (wenns stinkt 20€)", 5, ""),
                ("Frau/freindin fa an Mitspieler verraumen", 500, ""),
                ("Geburtstogsessen net innerholb 1 Monat gebrocht", 150, ""),
                ("Rote Karte wegn Unsportlichkeit", 50, ""),
                ("Gelbe Karte wegn Unsportlichkeit", 20, ""),
                ("Zu spät - Pauschale", 5, "")
            ]
            
            for name, amount, description in penalties:
                cursor.execute('INSERT INTO penalty_type (name, amount, description) VALUES (?, ?, ?)', 
                             (name, amount, description))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        st.error(f"Datenbankfehler: {str(e)}")
        return False

def execute_query(query, params=None):
    """Execute database query"""
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        conn.commit()
        lastrowid = cursor.lastrowid
        conn.close()
        return lastrowid
    except Exception as e:
        st.error(f"Datenbankfehler: {str(e)}")
        return None

def get_data(query, params=None):
    """Get data from database"""
    try:
        conn = sqlite3.connect(get_db_path())
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        return df
    except Exception as e:
        st.error(f"Datenbankfehler: {str(e)}")
        return pd.DataFrame()

def login_page():
    """Login page"""
    st.markdown("""
    <div style='text-align: center; padding: 2rem;'>
        <h1>🏆 ASV Natz Penalty Tracker</h1>
        <h3>Bitte melden Sie sich an</h3>
    </div>
    """, unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        with st.container():
            st.markdown("---")
            
            access_type = st.selectbox(
                "Zugriffstyp:",
                ["", "spieler", "kassier"],
                format_func=lambda x: {
                    "": "Bitte wählen...", 
                    "spieler": "👥 Spieler", 
                    "kassier": "💰 Kassier"
                }.get(x, x)
            )
            
            access_code = ""
            if access_type == "kassier":
                access_code = st.text_input("Zugangscode:", type="password")
            
            if st.button("Anmelden", type="primary", use_container_width=True):
                if access_type == "spieler":
                    st.session_state.authenticated = True
                    st.session_state.user_role = "spieler"
                    st.success("✅ Erfolgreich als Spieler angemeldet!")
                    st.rerun()
                elif access_type == "kassier":
                    if access_code == ACCESS_CODES['kassier']:
                        st.session_state.authenticated = True
                        st.session_state.user_role = "kassier"
                        st.success("✅ Erfolgreich als Kassier angemeldet!")
                        st.rerun()
                    else:
                        st.error("❌ Ungültiger Zugangscode!")
                else:
                    st.warning("⚠️ Bitte wählen Sie einen Zugriffstyp!")

def dashboard():
    """Dashboard"""
    st.title("📊 Dashboard")
    
    # Stats
    total_penalties_df = get_data("SELECT COUNT(*) as count FROM penalty")
    total_penalties = int(total_penalties_df['count'].iloc[0]) if not total_penalties_df.empty else 0
    
    total_amount_df = get_data("""
        SELECT COALESCE(SUM(pt.amount * p.quantity), 0) as total 
        FROM penalty p 
        JOIN penalty_type pt ON p.penalty_type_id = pt.id
    """)
    total_amount = float(total_amount_df['total'].iloc[0]) if not total_amount_df.empty else 0.0
    
    today = date.today().strftime('%Y-%m-%d')
    today_penalties_df = get_data("SELECT COUNT(*) as count FROM penalty WHERE date = ?", (today,))
    today_penalties = int(today_penalties_df['count'].iloc[0]) if not today_penalties_df.empty else 0
    
    # KPIs
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Gesamte Strafen", total_penalties)
    with col2:
        st.metric("Gesamtbetrag", f"€{total_amount:.2f}")
    with col3:
        st.metric("Heutige Strafen", today_penalties)
    with col4:
        avg_penalty = total_amount / total_penalties if total_penalties > 0 else 0
        st.metric("Ø pro Strafe", f"€{avg_penalty:.2f}")
    
    st.markdown("---")
    
    # Recent penalties
    st.subheader("🕒 Letzte Strafen")
    recent_penalties = get_data("""
        SELECT p.date, pl.name as player, pt.name as penalty_type, 
               p.quantity, pt.amount, (pt.amount * p.quantity) as total, p.notes
        FROM penalty p
        JOIN player pl ON p.player_id = pl.id
        JOIN penalty_type pt ON p.penalty_type_id = pt.id
        ORDER BY p.created_at DESC
        LIMIT 10
    """)
    
    if not recent_penalties.empty:
        st.dataframe(recent_penalties, use_container_width=True)
    else:
        st.info("Keine Strafen vorhanden.")
    
    # Charts
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("🏆 Top Spieler")
        top_players = get_data("""
            SELECT pl.name, SUM(pt.amount * p.quantity) as total_amount
            FROM player pl
            JOIN penalty p ON pl.id = p.player_id
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            GROUP BY pl.id, pl.name
            ORDER BY total_amount DESC
            LIMIT 10
        """)
        
        if not top_players.empty:
            fig = px.bar(top_players, x='name', y='total_amount', 
                        title="Top Spieler nach Gesamtbetrag")
            fig.update_xaxes(tickangle=45)
            st.plotly_chart(fig, use_container_width=True)
    
    with col2:
        st.subheader("📈 Entwicklung (30 Tage)")
        thirty_days_ago = (date.today() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        daily_stats = get_data("""
            SELECT p.date, SUM(pt.amount * p.quantity) as daily_total
            FROM penalty p
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            WHERE p.date >= ?
            GROUP BY p.date
            ORDER BY p.date
        """, (thirty_days_ago,))
        
        if not daily_stats.empty:
            daily_stats['cumulative'] = daily_stats['daily_total'].cumsum()
            fig = px.line(daily_stats, x='date', y='cumulative',
                         title="Kumulative Entwicklung")
            st.plotly_chart(fig, use_container_width=True)

def add_penalty():
    """Add penalty"""
    st.title("➕ Strafe hinzufügen")
    
    if st.session_state.user_role != 'kassier':
        st.error("Keine Berechtigung.")
        return
    
    players = get_data("SELECT id, name FROM player ORDER BY name")
    penalty_types = get_data("SELECT id, name, amount FROM penalty_type ORDER BY name")
    
    if players.empty or penalty_types.empty:
        st.error("Keine Spieler oder Vergehen gefunden!")
        return
    
    with st.form("add_penalty"):
        col1, col2 = st.columns(2)
        
        with col1:
            penalty_date = st.date_input("Datum", value=date.today())
            player_options = dict(zip(players['id'], players['name']))
            player_id = st.selectbox(
                "Spieler",
                players['id'].tolist(),
                format_func=lambda x: player_options[x]
            )
            
        with col2:
            penalty_type_options = dict(zip(penalty_types['id'], 
                                             [f"{row['name']} (€{row['amount']})" for _, row in penalty_types.iterrows()]))
            penalty_type_id = st.selectbox(
                "Vergehen",
                penalty_types['id'].tolist(),
                format_func=lambda x: penalty_type_options[x]
            )
            quantity = st.number_input("Anzahl", min_value=1, value=1)
        
        notes = st.text_area("Notizen")
        
        if st.form_submit_button("Strafe hinzufügen", type="primary"):
            result = execute_query("""
                INSERT INTO penalty (date, player_id, penalty_type_id, quantity, notes)
                VALUES (?, ?, ?, ?, ?)
            """, (penalty_date, player_id, penalty_type_id, quantity, notes))
            
            if result:
                st.success("Strafe erfolgreich hinzugefügt!")
                st.balloons()

def view_penalties():
    """View penalties"""
    st.title("📋 Strafen anzeigen")
    
    # Filters
    col1, col2, col3 = st.columns(3)
    
    players = get_data("SELECT id, name FROM player ORDER BY name")
    
    with col1:
        if not players.empty:
            player_options = dict(zip(players['id'], players['name']))
            player_filter = st.selectbox(
                "Spieler",
                [None] + players['id'].tolist(),
                format_func=lambda x: "Alle Spieler" if x is None else player_options[x]
            )
        else:
            player_filter = None
    
    with col2:
        date_from = st.date_input("Von", value=None)
    
    with col3:
        date_to = st.date_input("Bis", value=None)
    
    # Query
    query = """
        SELECT p.id, p.date, pl.name as player, pt.name as penalty_type, 
               p.quantity, pt.amount, (pt.amount * p.quantity) as total, p.notes
        FROM penalty p
        JOIN player pl ON p.player_id = pl.id
        JOIN penalty_type pt ON p.penalty_type_id = pt.id
        WHERE 1=1
    """
    params = []
    
    if player_filter:
        query += " AND p.player_id = ?"
        params.append(player_filter)
    
    if date_from:
        query += " AND p.date >= ?"
        params.append(date_from)
    
    if date_to:
        query += " AND p.date <= ?"
        params.append(date_to)
    
    query += " ORDER BY p.date DESC"
    
    penalties = get_data(query, params if params else None)
    
    if not penalties.empty:
        st.dataframe(penalties, use_container_width=True)
        
        total_count = len(penalties)
        total_amount = penalties['total'].sum()
        st.markdown(f"**Gesamt:** {total_count} Strafen, €{total_amount:.2f}")
        
        # Delete for kassier
        if st.session_state.user_role == 'kassier':
            st.subheader("Strafe löschen")
            penalty_options = dict(zip(penalties['id'], 
                                     [f"{row['date']} - {row['player']}" for _, row in penalties.iterrows()]))
            penalty_to_delete = st.selectbox(
                "Strafe",
                penalties['id'].tolist(),
                format_func=lambda x: penalty_options[x]
            )
            
            if st.button("Löschen", type="secondary"):
                if execute_query("DELETE FROM penalty WHERE id = ?", (penalty_to_delete,)):
                    st.success("Strafe gelöscht!")
                    st.rerun()
    else:
        st.info("Keine Strafen gefunden.")

def statistics():
    """Statistics"""
    st.title("📈 Statistiken")
    
    col1, col2 = st.columns(2)
    with col1:
        date_from = st.date_input("Von", value=date.today() - timedelta(days=90))
    with col2:
        date_to = st.date_input("Bis", value=date.today())
    
    # Period stats
    period_stats = get_data("""
        SELECT COUNT(*) as count, COALESCE(SUM(pt.amount * p.quantity), 0) as total
        FROM penalty p
        JOIN penalty_type pt ON p.penalty_type_id = pt.id
        WHERE p.date BETWEEN ? AND ?
    """, (date_from, date_to))
    
    if not period_stats.empty:
        count = int(period_stats['count'].iloc[0])
        total = float(period_stats['total'].iloc[0])
        
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Strafen", count)
        with col2:
            st.metric("Betrag", f"€{total:.2f}")
        with col3:
            avg = total / count if count > 0 else 0
            st.metric("Ø pro Strafe", f"€{avg:.2f}")
        with col4:
            days = (date_to - date_from).days + 1
            daily_avg = total / days if days > 0 else 0
            st.metric("Ø täglich", f"€{daily_avg:.2f}")
    
    # Charts
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Spieler Statistiken")
        player_stats = get_data("""
            SELECT pl.name, SUM(pt.amount * p.quantity) as total
            FROM player pl
            JOIN penalty p ON pl.id = p.player_id
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            WHERE p.date BETWEEN ? AND ?
            GROUP BY pl.id, pl.name
            ORDER BY total DESC
            LIMIT 10
        """, (date_from, date_to))
        
        if not player_stats.empty:
            fig = px.bar(player_stats, x='name', y='total')
            fig.update_xaxes(tickangle=45)
            st.plotly_chart(fig, use_container_width=True)
    
    with col2:
        st.subheader("Vergehen Statistiken")
        penalty_stats = get_data("""
            SELECT pt.name, SUM(pt.amount * p.quantity) as total
            FROM penalty_type pt
            JOIN penalty p ON pt.id = p.penalty_type_id
            WHERE p.date BETWEEN ? AND ?
            GROUP BY pt.id, pt.name
            ORDER BY total DESC
            LIMIT 10
        """, (date_from, date_to))
        
        if not penalty_stats.empty:
            fig = px.bar(penalty_stats, x='name', y='total')
            fig.update_xaxes(tickangle=45)
            st.plotly_chart(fig, use_container_width=True)

def manage_players():
    """Manage players"""
    st.title("👥 Spieler verwalten")
    
    if st.session_state.user_role != 'kassier':
        st.error("Keine Berechtigung.")
        return
    
    # Add player
    st.subheader("Neuer Spieler")
    with st.form("add_player"):
        name = st.text_input("Name")
        if st.form_submit_button("Hinzufügen"):
            if name.strip():
                result = execute_query("INSERT INTO player (name) VALUES (?)", (name.strip(),))
                if result:
                    st.success("Spieler hinzugefügt!")
                    st.rerun()
    
    # List players
    st.subheader("Spieler")
    players = get_data("SELECT id, name FROM player ORDER BY name")
    if not players.empty:
        st.dataframe(players, use_container_width=True)

def manage_penalty_types():
    """Manage penalty types"""
    st.title("⚖️ Vergehen verwalten")
    
    if st.session_state.user_role != 'kassier':
        st.error("Keine Berechtigung.")
        return
    
    # Add penalty type
    st.subheader("Neues Vergehen")
    with st.form("add_penalty_type"):
        col1, col2 = st.columns(2)
        with col1:
            name = st.text_input("Vergehen")
            amount = st.number_input("Betrag (€)", min_value=0.0, step=0.5)
        with col2:
            description = st.text_area("Beschreibung")
        
        if st.form_submit_button("Hinzufügen"):
            if name.strip():
                result = execute_query("INSERT INTO penalty_type (name, amount, description) VALUES (?, ?, ?)", 
                                     (name.strip(), amount, description.strip()))
                if result:
                    st.success("Vergehen hinzugefügt!")
                    st.rerun()
    
    # List penalty types
    st.subheader("Vergehen")
    penalty_types = get_data("SELECT id, name, amount, description FROM penalty_type ORDER BY name")
    if not penalty_types.empty:
        st.dataframe(penalty_types, use_container_width=True)

def export_data():
    """Export data"""
    st.title("📤 Export")
    
    if st.session_state.user_role != 'kassier':
        st.error("Keine Berechtigung.")
        return
    
    penalties = get_data("""
        SELECT p.date, pl.name as player, pt.name as penalty_type, 
               p.quantity, pt.amount, (pt.amount * p.quantity) as total, p.notes
        FROM penalty p
        JOIN player pl ON p.player_id = pl.id
        JOIN penalty_type pt ON p.penalty_type_id = pt.id
        ORDER BY p.date DESC
    """)
    
    if not penalties.empty:
        csv_buffer = io.StringIO()
        penalties.to_csv(csv_buffer, index=False, sep=';')
        csv_data = csv_buffer.getvalue()
        
        st.download_button(
            "CSV herunterladen",
            csv_data,
            f"penalty_export_{date.today().strftime('%Y%m%d')}.csv",
            "text/csv"
        )
        
        st.dataframe(penalties.head(20), use_container_width=True)
        st.info(f"Datensätze: {len(penalties)}")
    else:
        st.info("Keine Daten vorhanden.")

def main():
    """Main app"""
    # Initialize database
    if not init_database():
        st.error("Datenbankfehler!")
        return
    
    # Check authentication
    if not st.session_state.authenticated:
        login_page()
        return
    
    # Sidebar
    with st.sidebar:
        st.title("🏆 ASV Natz")
        st.markdown(f"**{st.session_state.user_role.title()}**")
        
        if st.button("Abmelden", use_container_width=True):
            st.session_state.authenticated = False
            st.session_state.user_role = None
            st.rerun()
        
        st.markdown("---")
        
        # Pages
        pages = {
            "📊 Dashboard": dashboard,
            "📋 Strafen anzeigen": view_penalties,
            "📈 Statistiken": statistics
        }
        
        if st.session_state.user_role == 'kassier':
            pages.update({
                "➕ Strafe hinzufügen": add_penalty,
                "👥 Spieler verwalten": manage_players,
                "⚖️ Vergehen verwalten": manage_penalty_types,
                "📤 Export": export_data
            })
        
        selected = st.selectbox("Navigation", list(pages.keys()))
        
        st.markdown("---")
        st.caption("ASV Natz Penalty Tracker")
    
    # Execute page
    if selected in pages:
        pages[selected]()

if __name__ == "__main__":
    main()