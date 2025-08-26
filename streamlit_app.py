#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ASV Natz Penalty Tracking Streamlit Application
Streamlit-based web interface for penalty management
"""

import streamlit as st
import pandas as pd
import sqlite3
from datetime import datetime, date, timedelta
import plotly.express as px
import plotly.graph_objects as go
import io

# Set page config
st.set_page_config(
    page_title="ASV Natz - Penalty Tracker",
    page_icon="⚽",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS to improve styling
st.markdown("""
<style>
    .main {
        padding-top: 1rem;
    }
    .stSelectbox label {
        font-weight: bold;
    }
    .stMetric {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 0.5rem solid #ff6b6b;
    }
</style>
""", unsafe_allow_html=True)

# Access codes for different roles
ACCESS_CODES = {
    'kassier': '1970'
}

# Initialize session state
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'user_role' not in st.session_state:
    st.session_state.user_role = None
if 'db_initialized' not in st.session_state:
    st.session_state.db_initialized = False

@st.cache_resource
def init_database():
    """Initialize database with default data"""
    if st.session_state.db_initialized:
        return True
        
    try:
        conn = sqlite3.connect('penalty_tracker.db')
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
        
        # Add players if not exist
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
        
        # Add penalty types if not exist
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
        st.session_state.db_initialized = True
        return True
    except Exception as e:
        st.error(f"Datenbankinitialisierung fehlgeschlagen: {str(e)}")
        return False

def get_db_connection():
    """Get database connection"""
    try:
        return sqlite3.connect('penalty_tracker.db')
    except Exception as e:
        st.error(f"Datenbankverbindung fehlgeschlagen: {str(e)}")
        return None

def get_data(query, params=None):
    """Execute SQL query and return results"""
    try:
        conn = get_db_connection()
        if conn is None:
            return pd.DataFrame()
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        return df
    except Exception as e:
        st.error(f"Datenbankfehler: {str(e)}")
        return pd.DataFrame()

def execute_query(query, params=None):
    """Execute SQL query without return"""
    try:
        conn = get_db_connection()
        if conn is None:
            return None
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

def authenticate():
    """Authentication page"""
    st.title("🔐 ASV Natz - Penalty Tracker")
    st.markdown("### Bitte melden Sie sich an")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("---")
        
        access_type = st.selectbox(
            "Zugriffstyp auswählen:",
            options=["", "spieler", "kassier"],
            format_func=lambda x: {"": "Bitte wählen...", "spieler": "👥 Spieler", "kassier": "💰 Kassier"}.get(x, x)
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
                    st.error("❌ Ungültiger Zugangscode für Kassier!")
            else:
                st.warning("⚠️ Bitte wählen Sie einen Zugriffstyp!")

def logout():
    """Logout function"""
    st.session_state.authenticated = False
    st.session_state.user_role = None
    st.success("👋 Sie wurden erfolgreich abgemeldet.")
    st.rerun()

def dashboard():
    """Main dashboard with overview"""
    st.title("📊 Dashboard")
    
    # Get stats safely
    try:
        total_penalties_df = get_data("SELECT COUNT(*) as count FROM penalty")
        total_penalties = int(total_penalties_df['count'].iloc[0]) if not total_penalties_df.empty else 0
        
        total_amount_df = get_data("""
            SELECT COALESCE(SUM(pt.amount * p.quantity), 0) as total 
            FROM penalty p 
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
        """)
        total_amount = float(total_amount_df['total'].iloc[0]) if not total_amount_df.empty else 0.0
        
        # Today's penalties
        today = date.today().strftime('%Y-%m-%d')
        today_penalties_df = get_data("SELECT COUNT(*) as count FROM penalty WHERE date = ?", (today,))
        today_penalties = int(today_penalties_df['count'].iloc[0]) if not today_penalties_df.empty else 0
        
        # Display KPIs
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
            st.dataframe(recent_penalties, use_container_width=True, hide_index=True)
        else:
            st.info("ℹ️ Keine Strafen vorhanden.")
        
        # Charts
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("🏆 Top Spieler (nach Betrag)")
            top_players = get_data("""
                SELECT pl.name, COUNT(p.id) as penalty_count, 
                       SUM(pt.amount * p.quantity) as total_amount
                FROM player pl
                JOIN penalty p ON pl.id = p.player_id
                JOIN penalty_type pt ON p.penalty_type_id = pt.id
                GROUP BY pl.id, pl.name
                ORDER BY total_amount DESC
                LIMIT 10
            """)
            
            if not top_players.empty:
                fig = px.bar(top_players, x='name', y='total_amount', 
                            title="Top Spieler nach Gesamtbetrag", 
                            labels={'name': 'Spieler', 'total_amount': 'Betrag (€)'})
                fig.update_xaxes(tickangle=45)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("ℹ️ Keine Daten für das Diagramm verfügbar.")
        
        with col2:
            st.subheader("📈 Kumulative Entwicklung (30 Tage)")
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
                             title="Kumulative Strafen-Entwicklung",
                             labels={'date': 'Datum', 'cumulative': 'Kumulativ (€)'})
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("ℹ️ Keine Daten für das Diagramm verfügbar.")
                
    except Exception as e:
        st.error(f"Fehler beim Laden des Dashboards: {str(e)}")

def add_penalty():
    """Add new penalty page"""
    st.title("➕ Strafe hinzufügen")
    
    if st.session_state.user_role != 'kassier':
        st.error("❌ Keine Berechtigung für diese Aktion.")
        return
    
    try:
        # Get players and penalty types
        players = get_data("SELECT id, name FROM player ORDER BY name")
        penalty_types = get_data("SELECT id, name, amount FROM penalty_type ORDER BY name")
        
        if players.empty or penalty_types.empty:
            st.error("❌ Keine Spieler oder Vergehen in der Datenbank gefunden!")
            return
        
        with st.form("add_penalty_form", clear_on_submit=True):
            col1, col2 = st.columns(2)
            
            with col1:
                penalty_date = st.date_input("Datum", value=date.today())
                player_options = dict(zip(players['id'], players['name']))
                player_id = st.selectbox(
                    "Spieler",
                    options=players['id'].tolist(),
                    format_func=lambda x: player_options[x]
                )
                
            with col2:
                penalty_type_options = dict(zip(penalty_types['id'], 
                                                  [f"{row['name']} (€{row['amount']})" for _, row in penalty_types.iterrows()]))
                penalty_type_id = st.selectbox(
                    "Vergehen",
                    options=penalty_types['id'].tolist(),
                    format_func=lambda x: penalty_type_options[x]
                )
                quantity = st.number_input("Anzahl", min_value=1, value=1)
            
            notes = st.text_area("Notizen (optional)")
            
            submitted = st.form_submit_button("✅ Strafe hinzufügen", type="primary")
            
            if submitted:
                try:
                    result = execute_query("""
                        INSERT INTO penalty (date, player_id, penalty_type_id, quantity, notes)
                        VALUES (?, ?, ?, ?, ?)
                    """, (penalty_date, player_id, penalty_type_id, quantity, notes))
                    
                    if result is not None:
                        st.success("✅ Strafe erfolgreich hinzugefügt!")
                        st.balloons()
                    else:
                        st.error("❌ Fehler beim Hinzufügen der Strafe!")
                        
                except Exception as e:
                    st.error(f"❌ Fehler beim Hinzufügen der Strafe: {str(e)}")
                    
    except Exception as e:
        st.error(f"Fehler beim Laden der Daten: {str(e)}")

def view_penalties():
    """View and manage penalties"""
    st.title("📋 Strafen verwalten")
    
    try:
        # Filters
        st.subheader("🔍 Filter")
        col1, col2, col3 = st.columns(3)
        
        players = get_data("SELECT id, name FROM player ORDER BY name")
        
        with col1:
            if not players.empty:
                player_options = dict(zip(players['id'], players['name']))
                player_filter = st.selectbox(
                    "Spieler",
                    options=[None] + players['id'].tolist(),
                    format_func=lambda x: "Alle Spieler" if x is None else player_options[x]
                )
            else:
                player_filter = None
        
        with col2:
            date_from = st.date_input("Von Datum", value=None)
        
        with col3:
            date_to = st.date_input("Bis Datum", value=None)
        
        # Build query
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
        
        st.subheader("📊 Strafen")
        
        if not penalties.empty:
            st.dataframe(penalties, use_container_width=True, hide_index=True)
            
            # Summary
            total_count = len(penalties)
            total_amount = penalties['total'].sum()
            st.markdown(f"**📈 Gesamt:** {total_count} Strafen, €{total_amount:.2f}")
            
            # Delete functionality for kassier
            if st.session_state.user_role == 'kassier':
                st.subheader("🗑️ Strafe löschen")
                penalty_options = dict(zip(penalties['id'], 
                                         [f"{row['date']} - {row['player']} - {row['penalty_type']}" for _, row in penalties.iterrows()]))
                penalty_to_delete = st.selectbox(
                    "Strafe auswählen",
                    options=penalties['id'].tolist(),
                    format_func=lambda x: penalty_options[x]
                )
                
                if st.button("🗑️ Strafe löschen", type="secondary"):
                    result = execute_query("DELETE FROM penalty WHERE id = ?", (penalty_to_delete,))
                    if result is not None:
                        st.success("✅ Strafe erfolgreich gelöscht!")
                        st.rerun()
        else:
            st.info("ℹ️ Keine Strafen gefunden.")
            
    except Exception as e:
        st.error(f"Fehler beim Laden der Strafen: {str(e)}")

def statistics():
    """Statistics page"""
    st.title("📈 Statistiken")
    
    try:
        # Date range
        col1, col2 = st.columns(2)
        with col1:
            date_from = st.date_input("Von Datum", value=date.today() - timedelta(days=90))
        with col2:
            date_to = st.date_input("Bis Datum", value=date.today())
        
        # KPIs for period
        period_stats = get_data("""
            SELECT COUNT(*) as count, COALESCE(SUM(pt.amount * p.quantity), 0) as total
            FROM penalty p
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            WHERE p.date BETWEEN ? AND ?
        """, (date_from, date_to))
        
        col1, col2, col3, col4 = st.columns(4)
        if not period_stats.empty:
            count = int(period_stats['count'].iloc[0])
            total = float(period_stats['total'].iloc[0])
            
            with col1:
                st.metric("Strafen (Zeitraum)", count)
            with col2:
                st.metric("Betrag (Zeitraum)", f"€{total:.2f}")
            with col3:
                avg_per_penalty = total / count if count > 0 else 0
                st.metric("Ø pro Strafe", f"€{avg_per_penalty:.2f}")
            with col4:
                days = (date_to - date_from).days + 1
                avg_per_day = total / days if days > 0 else 0
                st.metric("Ø pro Tag", f"€{avg_per_day:.2f}")
        else:
            with col1:
                st.metric("Strafen (Zeitraum)", 0)
            with col2:
                st.metric("Betrag (Zeitraum)", "€0.00")
            with col3:
                st.metric("Ø pro Strafe", "€0.00")
            with col4:
                st.metric("Ø pro Tag", "€0.00")
        
        # Charts
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("👥 Spieler Statistiken")
            player_stats = get_data("""
                SELECT pl.name, COUNT(p.id) as count, SUM(pt.amount * p.quantity) as total
                FROM player pl
                JOIN penalty p ON pl.id = p.player_id
                JOIN penalty_type pt ON p.penalty_type_id = pt.id
                WHERE p.date BETWEEN ? AND ?
                GROUP BY pl.id, pl.name
                ORDER BY total DESC
                LIMIT 15
            """, (date_from, date_to))
            
            if not player_stats.empty:
                fig = px.bar(player_stats, x='name', y='total', 
                            title="Spieler nach Gesamtbetrag",
                            labels={'name': 'Spieler', 'total': 'Betrag (€)'})
                fig.update_xaxes(tickangle=45)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("ℹ️ Keine Daten verfügbar.")
        
        with col2:
            st.subheader("⚖️ Vergehen Statistiken")
            penalty_stats = get_data("""
                SELECT pt.name, COUNT(p.id) as count, SUM(pt.amount * p.quantity) as total
                FROM penalty_type pt
                JOIN penalty p ON pt.id = p.penalty_type_id
                WHERE p.date BETWEEN ? AND ?
                GROUP BY pt.id, pt.name
                ORDER BY total DESC
                LIMIT 15
            """, (date_from, date_to))
            
            if not penalty_stats.empty:
                fig = px.bar(penalty_stats, x='name', y='total', 
                            title="Vergehen nach Gesamtbetrag",
                            labels={'name': 'Vergehen', 'total': 'Betrag (€)'})
                fig.update_xaxes(tickangle=45)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("ℹ️ Keine Daten verfügbar.")
        
        # Timeline
        st.subheader("📅 Zeitliche Entwicklung")
        daily_stats = get_data("""
            SELECT p.date, SUM(pt.amount * p.quantity) as daily_total
            FROM penalty p
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            WHERE p.date BETWEEN ? AND ?
            GROUP BY p.date
            ORDER BY p.date
        """, (date_from, date_to))
        
        if not daily_stats.empty:
            daily_stats['cumulative'] = daily_stats['daily_total'].cumsum()
            
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=daily_stats['date'], y=daily_stats['daily_total'], 
                                    mode='lines+markers', name='Täglich', line=dict(color='blue')))
            fig.add_trace(go.Scatter(x=daily_stats['date'], y=daily_stats['cumulative'], 
                                    mode='lines', name='Kumulativ', line=dict(color='red')))
            fig.update_layout(title="Strafen-Entwicklung über Zeit", 
                            xaxis_title="Datum", yaxis_title="Betrag (€)")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("ℹ️ Keine Daten für das Diagramm verfügbar.")
            
    except Exception as e:
        st.error(f"Fehler beim Laden der Statistiken: {str(e)}")

def manage_players():
    """Manage players page"""
    st.title("👥 Spieler verwalten")
    
    if st.session_state.user_role != 'kassier':
        st.error("❌ Keine Berechtigung für diese Aktion.")
        return
    
    try:
        # Add new player
        st.subheader("➕ Neuer Spieler")
        with st.form("add_player_form"):
            new_player_name = st.text_input("Spielername")
            submitted = st.form_submit_button("✅ Spieler hinzufügen")
            
            if submitted and new_player_name.strip():
                try:
                    result = execute_query("INSERT INTO player (name) VALUES (?)", (new_player_name.strip(),))
                    if result is not None:
                        st.success("✅ Spieler erfolgreich hinzugefügt!")
                        st.rerun()
                    else:
                        st.error("❌ Fehler beim Hinzufügen des Spielers!")
                except Exception as e:
                    if "UNIQUE constraint failed" in str(e):
                        st.error("❌ Spieler existiert bereits!")
                    else:
                        st.error(f"❌ Fehler: {str(e)}")
        
        # List existing players
        st.subheader("📋 Bestehende Spieler")
        players = get_data("SELECT id, name FROM player ORDER BY name")
        
        if not players.empty:
            st.dataframe(players, use_container_width=True, hide_index=True)
            
            # Delete player
            st.subheader("🗑️ Spieler löschen")
            st.warning("⚠️ Das Löschen eines Spielers entfernt auch alle seine Strafen!")
            
            player_options = dict(zip(players['id'], players['name']))
            player_to_delete = st.selectbox(
                "Spieler auswählen",
                options=players['id'].tolist(),
                format_func=lambda x: player_options[x]
            )
            
            if st.button("🗑️ Spieler löschen", type="secondary"):
                try:
                    # Delete penalties first, then player
                    execute_query("DELETE FROM penalty WHERE player_id = ?", (player_to_delete,))
                    result = execute_query("DELETE FROM player WHERE id = ?", (player_to_delete,))
                    if result is not None:
                        st.success("✅ Spieler und alle zugehörigen Strafen wurden gelöscht!")
                        st.rerun()
                except Exception as e:
                    st.error(f"❌ Fehler beim Löschen: {str(e)}")
        else:
            st.info("ℹ️ Keine Spieler vorhanden.")
            
    except Exception as e:
        st.error(f"Fehler beim Laden der Spielerverwaltung: {str(e)}")

def manage_penalty_types():
    """Manage penalty types page"""
    st.title("⚖️ Vergehen verwalten")
    
    if st.session_state.user_role != 'kassier':
        st.error("❌ Keine Berechtigung für diese Aktion.")
        return
    
    try:
        # Add new penalty type
        st.subheader("➕ Neues Vergehen")
        with st.form("add_penalty_type_form"):
            col1, col2 = st.columns(2)
            with col1:
                new_penalty_name = st.text_input("Vergehen")
                new_penalty_amount = st.number_input("Betrag (€)", min_value=0.0, step=0.5)
            with col2:
                new_penalty_description = st.text_area("Beschreibung (optional)")
            
            submitted = st.form_submit_button("✅ Vergehen hinzufügen")
            
            if submitted and new_penalty_name.strip():
                try:
                    result = execute_query("INSERT INTO penalty_type (name, amount, description) VALUES (?, ?, ?)", 
                                        (new_penalty_name.strip(), new_penalty_amount, new_penalty_description.strip()))
                    if result is not None:
                        st.success("✅ Vergehen erfolgreich hinzugefügt!")
                        st.rerun()
                    else:
                        st.error("❌ Fehler beim Hinzufügen des Vergehens!")
                except Exception as e:
                    if "UNIQUE constraint failed" in str(e):
                        st.error("❌ Vergehen existiert bereits!")
                    else:
                        st.error(f"❌ Fehler: {str(e)}")
        
        # List existing penalty types
        st.subheader("📋 Bestehende Vergehen")
        penalty_types = get_data("SELECT id, name, amount, description FROM penalty_type ORDER BY name")
        
        if not penalty_types.empty:
            st.dataframe(penalty_types, use_container_width=True, hide_index=True)
        else:
            st.info("ℹ️ Keine Vergehen vorhanden.")
            
    except Exception as e:
        st.error(f"Fehler beim Laden der Vergehen-Verwaltung: {str(e)}")

def export_data():
    """Export data to CSV"""
    st.title("📤 Daten exportieren")
    
    if st.session_state.user_role != 'kassier':
        st.error("❌ Keine Berechtigung für diese Aktion.")
        return
    
    try:
        # Get all penalty data
        penalties = get_data("""
            SELECT p.date, pl.name as player, pt.name as penalty_type, 
                   p.quantity, pt.amount, (pt.amount * p.quantity) as total, p.notes
            FROM penalty p
            JOIN player pl ON p.player_id = pl.id
            JOIN penalty_type pt ON p.penalty_type_id = pt.id
            ORDER BY p.date DESC
        """)
        
        if not penalties.empty:
            # Convert to CSV
            csv_buffer = io.StringIO()
            penalties.to_csv(csv_buffer, index=False, sep=';', encoding='utf-8')
            csv_data = csv_buffer.getvalue()
            
            col1, col2 = st.columns(2)
            with col1:
                st.download_button(
                    label="📥 CSV herunterladen",
                    data=csv_data,
                    file_name=f"penalty_export_{date.today().strftime('%Y%m%d')}.csv",
                    mime="text/csv",
                    type="primary"
                )
            
            with col2:
                st.metric("Datensätze", len(penalties))
            
            st.subheader("📊 Vorschau")
            st.dataframe(penalties.head(20), use_container_width=True, hide_index=True)
            st.info(f"ℹ️ Gefunden: {len(penalties)} Strafen")
        else:
            st.info("ℹ️ Keine Daten zum Exportieren vorhanden.")
            
    except Exception as e:
        st.error(f"Fehler beim Exportieren: {str(e)}")

def main():
    """Main application"""
    # Initialize database
    if not init_database():
        st.error("❌ Datenbank konnte nicht initialisiert werden!")
        return
    
    # Authentication check
    if not st.session_state.authenticated:
        authenticate()
        return
    
    # Sidebar navigation
    with st.sidebar:
        st.title("🏆 ASV Natz")
        st.markdown(f"**Angemeldet als:** {st.session_state.user_role.title()}")
        
        if st.button("👋 Abmelden", type="secondary", use_container_width=True):
            logout()
            return
        
        st.markdown("---")
        
        # Navigation
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
                "📤 Daten exportieren": export_data
            })
        
        # Create navigation
        selected_page = st.selectbox("📍 Navigation", list(pages.keys()), label_visibility="collapsed")
        
        st.markdown("---")
        st.caption("ASV Natz Penalty Tracker v2.0")
    
    # Execute selected page
    try:
        if selected_page in pages:
            pages[selected_page]()
        else:
            st.error("❌ Seite nicht gefunden!")
    except Exception as e:
        st.error(f"❌ Unerwarteter Fehler: {str(e)}")
        st.exception(e)

if __name__ == "__main__":
    main()