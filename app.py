#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ASV Natz Penalty Tracking Web Application
Flask-based web interface for penalty management
"""

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timedelta
import json
import csv
import io
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'asv-natz-penalty-tracker-2025'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///penalty_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Database Models
class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)

class PenaltyType(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(500))

class Penalty(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey('player.id'), nullable=False)
    penalty_type_id = db.Column(db.Integer, db.ForeignKey('penalty_type.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    player = db.relationship('Player', backref='penalties')
    penalty_type = db.relationship('PenaltyType', backref='penalties')
    
    @property
    def total_amount(self):
        return self.quantity * self.penalty_type.amount

def init_database():
    """Initialize database with default data"""
    db.create_all()
    
    # Add players if not exist
    if Player.query.count() == 0:
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
            player = Player(name=player_name)
            db.session.add(player)
    
    # Add penalty types if not exist
    if PenaltyType.query.count() == 0:
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
            penalty_type = PenaltyType(name=name, amount=amount, description=description)
            db.session.add(penalty_type)
    
    db.session.commit()

# Routes
@app.route('/')
def index():
    """Main dashboard with overview"""
    total_penalties = Penalty.query.count()
    total_amount = db.session.query(db.func.sum(PenaltyType.amount * Penalty.quantity))\
        .select_from(Penalty).join(PenaltyType).scalar() or 0
    
    # Recent penalties
    recent_penalties = Penalty.query\
        .order_by(Penalty.created_at.desc())\
        .limit(10)\
        .all()
    
    # Top players by penalty count
    top_players = db.session.query(
        Player.name,
        db.func.count(Penalty.id).label('penalty_count'),
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('total_amount')
    ).select_from(Player).join(Penalty).join(PenaltyType)\
     .group_by(Player.id, Player.name)\
     .order_by(db.func.sum(PenaltyType.amount * Penalty.quantity).desc())\
     .limit(10).all()
     
    # Daily cumulative data for dashboard chart (last 30 days)
    thirty_days_ago = (date.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')
    
    daily_stats = db.session.query(
        Penalty.date,
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('daily_total')
    ).select_from(Penalty).join(PenaltyType)\
     .filter(Penalty.date >= thirty_days_ago, Penalty.date <= today)\
     .group_by(Penalty.date)\
     .order_by(Penalty.date)\
     .all()
    
    # Calculate cumulative sums
    cumulative_data = []
    running_total = 0
    for daily in daily_stats:
        running_total += float(daily.daily_total)
        cumulative_data.append({
            'date': daily.date.strftime('%Y-%m-%d'),
            'daily_amount': float(daily.daily_total),
            'cumulative_amount': running_total
        })
    
    return render_template('dashboard.html', 
                         total_penalties=total_penalties,
                         total_amount=total_amount,
                         recent_penalties=recent_penalties,
                         top_players=top_players,
                         cumulative_data=cumulative_data)

@app.route('/add_penalty', methods=['GET', 'POST'])
def add_penalty():
    """Add new penalty"""
    if request.method == 'POST':
        try:
            penalty_date = datetime.strptime(request.form['date'], '%Y-%m-%d').date()
            player_id = int(request.form['player_id'])
            penalty_type_id = int(request.form['penalty_type_id'])
            quantity = int(request.form.get('quantity', 1))
            notes = request.form.get('notes', '')
            
            penalty = Penalty(
                date=penalty_date,
                player_id=player_id,
                penalty_type_id=penalty_type_id,
                quantity=quantity,
                notes=notes
            )
            
            db.session.add(penalty)
            db.session.commit()
            
            flash('Strafe erfolgreich hinzugefügt!', 'success')
            return redirect(url_for('penalties'))
            
        except Exception as e:
            flash(f'Fehler beim Hinzufügen der Strafe: {str(e)}', 'error')
    
    players = Player.query.order_by(Player.name).all()
    penalty_types = PenaltyType.query.order_by(PenaltyType.name).all()
    
    return render_template('add_penalty.html', 
                         players=players, 
                         penalty_types=penalty_types,
                         today=date.today())

@app.route('/penalties')
def penalties():
    """List all penalties with filtering and player totals"""
    page = request.args.get('page', 1, type=int)
    player_filter = request.args.get('player')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    query = Penalty.query
    
    # Apply filters
    if player_filter:
        query = query.filter(Penalty.player_id == player_filter)
    
    if date_from:
        date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
        query = query.filter(Penalty.date >= date_from_obj)
    
    if date_to:
        date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
        query = query.filter(Penalty.date <= date_to_obj)
    
    penalties_pagination = query.order_by(Penalty.date.desc())\
        .paginate(page=page, per_page=20, error_out=False)
    
    players = Player.query.order_by(Player.name).all()
    
    # Calculate player totals (all-time)
    player_totals = db.session.query(
        Player.id,
        Player.name,
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('total')
    ).select_from(Player)\
     .join(Penalty)\
     .join(PenaltyType)\
     .group_by(Player.id, Player.name)\
     .all()
    
    # Convert to dictionary for easy lookup
    player_totals_dict = {pt.id: pt.total for pt in player_totals}
    
    return render_template('penalties.html', 
                         penalties=penalties_pagination.items,
                         pagination=penalties_pagination,
                         players=players,
                         player_totals=player_totals_dict,
                         filters={
                             'player': player_filter,
                             'date_from': date_from,
                             'date_to': date_to
                         })

@app.route('/statistics')
def statistics():
    """Statistics dashboard"""
    # Date range for analysis
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    if not date_from:
        date_from = (date.today() - timedelta(days=90)).strftime('%Y-%m-%d')
    if not date_to:
        date_to = date.today().strftime('%Y-%m-%d')
    
    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
    
    # Build query for date range
    base_query = Penalty.query.filter(
        Penalty.date >= date_from_obj,
        Penalty.date <= date_to_obj
    )
    
    # KPIs
    total_count = base_query.count()
    total_amount = db.session.query(db.func.sum(PenaltyType.amount * Penalty.quantity))\
        .select_from(Penalty).join(PenaltyType).filter(
            Penalty.date >= date_from_obj,
            Penalty.date <= date_to_obj
        ).scalar() or 0
    
    avg_per_penalty = total_amount / total_count if total_count > 0 else 0
    
    max_penalty = db.session.query(db.func.max(PenaltyType.amount * Penalty.quantity))\
        .select_from(Penalty).join(PenaltyType).filter(
            Penalty.date >= date_from_obj,
            Penalty.date <= date_to_obj
        ).scalar() or 0
    
    # Daily penalty sums for chart (cumulative over time)
    daily_stats = db.session.query(
        Penalty.date,
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('daily_total')
    ).select_from(Penalty).join(PenaltyType)\
     .filter(Penalty.date >= date_from_obj, Penalty.date <= date_to_obj)\
     .group_by(Penalty.date)\
     .order_by(Penalty.date)\
     .all()
    
    # Calculate cumulative sums
    cumulative_data = []
    running_total = 0
    for daily in daily_stats:
        running_total += float(daily.daily_total)
        cumulative_data.append({
            'date': daily.date.strftime('%Y-%m-%d'),
            'daily_amount': float(daily.daily_total),
            'cumulative_amount': running_total
        })
    
    # Player statistics
    player_stats = db.session.query(
        Player.name,
        db.func.count(Penalty.id).label('count'),
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('total')
    ).select_from(Player).join(Penalty).join(PenaltyType)\
     .filter(Penalty.date >= date_from_obj, Penalty.date <= date_to_obj)\
     .group_by(Player.id, Player.name)\
     .order_by(db.func.sum(PenaltyType.amount * Penalty.quantity).desc())\
     .all()
    
    # Penalty type statistics
    penalty_stats = db.session.query(
        PenaltyType.name,
        db.func.count(Penalty.id).label('count'),
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('total')
    ).select_from(PenaltyType).join(Penalty)\
     .filter(Penalty.date >= date_from_obj, Penalty.date <= date_to_obj)\
     .group_by(PenaltyType.id, PenaltyType.name)\
     .order_by(db.func.sum(PenaltyType.amount * Penalty.quantity).desc())\
     .all()
    
    return render_template('statistics.html',
                         date_from=date_from,
                         date_to=date_to,
                         total_count=total_count,
                         total_amount=total_amount,
                         avg_per_penalty=avg_per_penalty,
                         max_penalty=max_penalty,
                         player_stats=player_stats,
                         penalty_stats=penalty_stats,
                         cumulative_data=cumulative_data)

@app.route('/players')
def players():
    """Manage players"""
    players = Player.query.order_by(Player.name).all()
    return render_template('players.html', players=players)

@app.route('/add_player', methods=['POST'])
def add_player():
    """Add new player"""
    name = request.form.get('name', '').strip()
    if name:
        if not Player.query.filter_by(name=name).first():
            player = Player(name=name)
            db.session.add(player)
            db.session.commit()
            flash('Spieler erfolgreich hinzugefügt!', 'success')
        else:
            flash('Spieler existiert bereits!', 'warning')
    else:
        flash('Name ist erforderlich!', 'error')
    
    return redirect(url_for('players'))

@app.route('/penalty_types')
def penalty_types():
    """Manage penalty types"""
    penalty_types = PenaltyType.query.order_by(PenaltyType.name).all()
    return render_template('penalty_types.html', penalty_types=penalty_types)

@app.route('/add_penalty_type', methods=['POST'])
def add_penalty_type():
    """Add new penalty type"""
    try:
        name = request.form.get('name', '').strip()
        amount = float(request.form.get('amount', 0))
        description = request.form.get('description', '').strip()
        
        if name:
            if not PenaltyType.query.filter_by(name=name).first():
                penalty_type = PenaltyType(name=name, amount=amount, description=description)
                db.session.add(penalty_type)
                db.session.commit()
                flash('Vergehen erfolgreich hinzugefügt!', 'success')
            else:
                flash('Vergehen existiert bereits!', 'warning')
        else:
            flash('Name ist erforderlich!', 'error')
    except ValueError:
        flash('Ungültiger Betrag!', 'error')
    
    return redirect(url_for('penalty_types'))

@app.route('/export_csv')
def export_csv():
    """Export penalties to CSV"""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    
    # Headers
    writer.writerow(['Datum', 'Spieler', 'Vergehen', 'Anzahl', 'Einzelbetrag (€)', 'Gesamt (€)', 'Notiz'])
    
    # Data
    penalties = Penalty.query.order_by(Penalty.date.desc()).all()
    for penalty in penalties:
        writer.writerow([
            penalty.date.strftime('%Y-%m-%d'),
            penalty.player.name,
            penalty.penalty_type.name,
            penalty.quantity,
            penalty.penalty_type.amount,
            penalty.total_amount,
            penalty.notes or ''
        ])
    
    # Create response
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='penalty_export.csv'
    )

@app.route('/api/penalty_chart_data')
def penalty_chart_data():
    """API endpoint for chart data"""
    days = request.args.get('days', 30, type=int)
    player_id = request.args.get('player_id', type=int)
    
    # Date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    # Build query
    query = db.session.query(
        Penalty.date,
        db.func.sum(PenaltyType.amount * Penalty.quantity).label('total')
    ).join(PenaltyType)\
     .filter(Penalty.date >= start_date, Penalty.date <= end_date)
    
    if player_id:
        query = query.filter(Penalty.player_id == player_id)
    
    data = query.group_by(Penalty.date)\
               .order_by(Penalty.date)\
               .all()
    
    # Format for chart
    chart_data = {
        'dates': [item[0].strftime('%Y-%m-%d') for item in data],
        'amounts': [float(item[1]) for item in data]
    }
    
    return jsonify(chart_data)

if __name__ == '__main__':
    with app.app_context():
        init_database()
    app.run(host='0.0.0.0', port=5000, debug=True)