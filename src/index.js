import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.get('/static/*', serveStatic({ root: './' }));

// Database helper functions
const db = {
  async query(env, sql, params = []) {
    try {
      const result = await env.DB.prepare(sql).bind(...params).all();
      return result.results || [];
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },

  async execute(env, sql, params = []) {
    try {
      const result = await env.DB.prepare(sql).bind(...params).run();
      return result;
    } catch (error) {
      console.error('Database execute error:', error);
      throw error;
    }
  },

  async getStats(env, dateFrom, dateTo) {
    const penalties = await this.query(env, `
      SELECT 
        p.*,
        pl.name as player_name,
        pt.name as penalty_name,
        pt.amount as penalty_amount,
        (p.quantity * pt.amount) as total_amount
      FROM penalties p
      JOIN players pl ON p.player_id = pl.id
      JOIN penalty_types pt ON p.penalty_type_id = pt.id
      WHERE p.date >= ? AND p.date <= ?
      ORDER BY p.date DESC
    `, [dateFrom, dateTo]);

    const totalCount = penalties.length;
    const totalAmount = penalties.reduce((sum, p) => sum + p.total_amount, 0);
    const maxPenalty = Math.max(...penalties.map(p => p.total_amount), 0);
    const avgPerPenalty = totalCount > 0 ? totalAmount / totalCount : 0;

    // Player statistics
    const playerStats = {};
    penalties.forEach(p => {
      if (!playerStats[p.player_name]) {
        playerStats[p.player_name] = { count: 0, total: 0 };
      }
      playerStats[p.player_name].count += 1;
      playerStats[p.player_name].total += p.total_amount;
    });

    const topPlayers = Object.entries(playerStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      totalCount,
      totalAmount: Math.round(totalAmount * 100) / 100,
      maxPenalty: Math.round(maxPenalty * 100) / 100,
      avgPerPenalty: Math.round(avgPerPenalty * 100) / 100,
      topPlayers,
      recentPenalties: penalties.slice(0, 10)
    };
  }
};

// HTML Templates
const getHTML = (title, content, activeNav = '') => `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ASV Natz Penalty Tracker</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; }
        .navbar-brand { font-weight: 600; }
        .card { box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075); border-radius: 0.375rem; }
        .bg-primary { background-color: #0066cc !important; }
        .btn-primary { background-color: #0066cc; border-color: #0066cc; }
        .btn-primary:hover { background-color: #0056b3; border-color: #0056b3; }
    </style>
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container">
            <a class="navbar-brand" href="/">
                <i class="fas fa-futbol"></i> ASV Natz Penalty Tracker
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav me-auto">
                    <li class="nav-item">
                        <a class="nav-link ${activeNav === 'dashboard' ? 'active' : ''}" href="/">
                            <i class="fas fa-tachometer-alt"></i> Dashboard
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link ${activeNav === 'add' ? 'active' : ''}" href="/add">
                            <i class="fas fa-plus"></i> Strafe hinzufügen
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link ${activeNav === 'penalties' ? 'active' : ''}" href="/penalties">
                            <i class="fas fa-list"></i> Strafen
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link ${activeNav === 'statistics' ? 'active' : ''}" href="/statistics">
                            <i class="fas fa-chart-bar"></i> Statistiken
                        </a>
                    </li>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown">
                            <i class="fas fa-cogs"></i> Verwaltung
                        </a>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item" href="/players"><i class="fas fa-users"></i> Spieler</a></li>
                            <li><a class="dropdown-item" href="/penalty-types"><i class="fas fa-tags"></i> Vergehen</a></li>
                        </ul>
                    </li>
                </ul>
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="/api/export/csv">
                            <i class="fas fa-download"></i> CSV Export
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <main class="container mt-4">
        ${content}
    </main>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        // Auto-dismiss success alerts
        setTimeout(() => {
            document.querySelectorAll('.alert-success').forEach(alert => {
                new bootstrap.Alert(alert).close();
            });
        }, 3000);
    </script>
</body>
</html>`;

// Routes

// Dashboard
app.get('/', async (c) => {
  const env = c.env;
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const stats = await db.getStats(env, thirtyDaysAgo, today);
  
  const content = `
    <div class="row">
        <div class="col-12">
            <h1 class="mb-4"><i class="fas fa-tachometer-alt"></i> Dashboard</h1>
        </div>
    </div>

    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card text-white bg-primary">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">Gesamtstrafen</h6>
                            <h3 class="mb-0">${stats.totalCount}</h3>
                        </div>
                        <div class="align-self-center">
                            <i class="fas fa-list-ol fa-2x"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-success">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">Gesamtbetrag</h6>
                            <h3 class="mb-0">${stats.totalAmount.toFixed(2)}€</h3>
                        </div>
                        <div class="align-self-center">
                            <i class="fas fa-euro-sign fa-2x"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-warning">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">Ø pro Strafe</h6>
                            <h3 class="mb-0">${stats.avgPerPenalty.toFixed(2)}€</h3>
                        </div>
                        <div class="align-self-center">
                            <i class="fas fa-calculator fa-2x"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-info">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="card-title">Aktionen</h6>
                            <a href="/add" class="btn btn-light btn-sm">
                                <i class="fas fa-plus"></i> Neue Strafe
                            </a>
                        </div>
                        <div class="align-self-center">
                            <i class="fas fa-plus fa-2x"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-clock"></i> Neueste Strafen</h5>
                </div>
                <div class="card-body">
                    ${stats.recentPenalties.length ? 
                      stats.recentPenalties.map(p => `
                        <div class="list-group-item d-flex justify-content-between align-items-center border-0">
                            <div>
                                <strong>${p.player_name}</strong><br>
                                <small class="text-muted">${p.penalty_name}</small><br>
                                <small class="text-muted">${new Date(p.date).toLocaleDateString('de-DE')}</small>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-primary">${p.quantity}x</span><br>
                                <strong>${p.total_amount.toFixed(2)}€</strong>
                            </div>
                        </div>
                      `).join('') 
                      : '<p class="text-muted">Noch keine Strafen erfasst.</p>'
                    }
                </div>
                <div class="card-footer">
                    <a href="/penalties" class="btn btn-outline-primary btn-sm">
                        <i class="fas fa-list"></i> Alle Strafen anzeigen
                    </a>
                </div>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-trophy"></i> Top Spieler (Gesamtbetrag)</h5>
                </div>
                <div class="card-body">
                    ${stats.topPlayers.length ? 
                      stats.topPlayers.map(p => `
                        <div class="list-group-item d-flex justify-content-between align-items-center border-0">
                            <div>
                                <strong>${p.name}</strong><br>
                                <small class="text-muted">${p.count} Strafen</small>
                            </div>
                            <div>
                                <span class="badge bg-danger fs-6">${p.total.toFixed(2)}€</span>
                            </div>
                        </div>
                      `).join('')
                      : '<p class="text-muted">Noch keine Daten verfügbar.</p>'
                    }
                </div>
            </div>
        </div>
    </div>`;

  return c.html(getHTML('Dashboard', content, 'dashboard'));
});

// Add Penalty Form
app.get('/add', async (c) => {
  const env = c.env;
  const players = await db.query(env, 'SELECT * FROM players ORDER BY name');
  const penaltyTypes = await db.query(env, 'SELECT * FROM penalty_types ORDER BY name');
  const today = new Date().toISOString().split('T')[0];
  
  const content = `
    <div class="row">
        <div class="col-md-8 mx-auto">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-plus"></i> Neue Strafe hinzufügen</h5>
                </div>
                <form method="POST" action="/api/penalties">
                    <div class="card-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <label for="date" class="form-label">Datum *</label>
                                <input type="date" class="form-control" id="date" name="date" 
                                       value="${today}" required>
                            </div>
                            <div class="col-md-6">
                                <label for="quantity" class="form-label">Anzahl</label>
                                <input type="number" class="form-control" id="quantity" name="quantity" 
                                       value="1" min="1" required>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label for="player_id" class="form-label">Spieler *</label>
                            <select class="form-select" id="player_id" name="player_id" required>
                                <option value="">Spieler auswählen...</option>
                                ${players.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="mb-3">
                            <label for="penalty_type_id" class="form-label">Vergehen *</label>
                            <select class="form-select" id="penalty_type_id" name="penalty_type_id" required onchange="updateAmount()">
                                <option value="">Vergehen auswählen...</option>
                                ${penaltyTypes.map(pt => 
                                  `<option value="${pt.id}" data-amount="${pt.amount}">
                                     ${pt.name} (${pt.amount.toFixed(2)}€)
                                   </option>`
                                ).join('')}
                            </select>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Vorschau Gesamtbetrag</label>
                            <div class="alert alert-info">
                                <i class="fas fa-calculator"></i> 
                                <span id="amount-preview">Wählen Sie ein Vergehen aus</span>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label for="notes" class="form-label">Notizen (optional)</label>
                            <textarea class="form-control" id="notes" name="notes" rows="3" 
                                      placeholder="Zusätzliche Informationen..."></textarea>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Strafe speichern
                        </button>
                        <a href="/penalties" class="btn btn-secondary">
                            <i class="fas fa-times"></i> Abbrechen
                        </a>
                    </div>
                </form>
            </div>
        </div>
    </div>
    
    <script>
    function updateAmount() {
        const penaltySelect = document.getElementById('penalty_type_id');
        const quantityInput = document.getElementById('quantity');
        const preview = document.getElementById('amount-preview');
        
        const selectedOption = penaltySelect.options[penaltySelect.selectedIndex];
        const amount = selectedOption.dataset.amount;
        const quantity = parseInt(quantityInput.value) || 1;
        
        if (amount) {
            const total = parseFloat(amount) * quantity;
            preview.innerHTML = \`\${quantity}x \${parseFloat(amount).toFixed(2)}€ = <strong>\${total.toFixed(2)}€</strong>\`;
        } else {
            preview.innerHTML = 'Wählen Sie ein Vergehen aus';
        }
    }
    
    document.getElementById('quantity').addEventListener('input', updateAmount);
    </script>`;

  return c.html(getHTML('Strafe hinzufügen', content, 'add'));
});

// API Routes

// Create penalty
app.post('/api/penalties', async (c) => {
  const env = c.env;
  const formData = await c.req.formData();
  
  const date = formData.get('date');
  const playerId = formData.get('player_id');
  const penaltyTypeId = formData.get('penalty_type_id');
  const quantity = parseInt(formData.get('quantity')) || 1;
  const notes = formData.get('notes') || '';

  try {
    await db.execute(env, 
      'INSERT INTO penalties (date, player_id, penalty_type_id, quantity, notes) VALUES (?, ?, ?, ?, ?)',
      [date, playerId, penaltyTypeId, quantity, notes]
    );
    
    return c.redirect('/penalties?success=1');
  } catch (error) {
    return c.redirect('/add?error=' + encodeURIComponent(error.message));
  }
});

// Get penalties list
app.get('/penalties', async (c) => {
  const env = c.env;
  const success = c.req.query('success');
  
  const penalties = await db.query(env, `
    SELECT 
      p.*,
      pl.name as player_name,
      pt.name as penalty_name,
      pt.amount as penalty_amount,
      (p.quantity * pt.amount) as total_amount
    FROM penalties p
    JOIN players pl ON p.player_id = pl.id
    JOIN penalty_types pt ON p.penalty_type_id = pt.id
    ORDER BY p.date DESC, p.created_at DESC
    LIMIT 50
  `);

  const content = `
    ${success ? '<div class="alert alert-success alert-dismissible fade show"><strong>Erfolg!</strong> Strafe wurde hinzugefügt. <button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>' : ''}
    
    <div class="row">
        <div class="col-12">
            <h1 class="mb-4"><i class="fas fa-list"></i> Strafen verwalten</h1>
        </div>
    </div>

    <div class="row mb-3">
        <div class="col-md-6">
            <a href="/add" class="btn btn-success">
                <i class="fas fa-plus"></i> Neue Strafe hinzufügen
            </a>
        </div>
        <div class="col-md-6 text-end">
            <a href="/api/export/csv" class="btn btn-outline-primary">
                <i class="fas fa-download"></i> CSV Export
            </a>
        </div>
    </div>

    <div class="card">
        <div class="card-body">
            ${penalties.length ? `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Spieler</th>
                                <th>Vergehen</th>
                                <th>Anzahl</th>
                                <th>Einzelbetrag</th>
                                <th>Gesamtbetrag</th>
                                <th>Notizen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${penalties.map(p => `
                                <tr>
                                    <td>${new Date(p.date).toLocaleDateString('de-DE')}</td>
                                    <td><strong>${p.player_name}</strong></td>
                                    <td>${p.penalty_name}</td>
                                    <td><span class="badge bg-primary">${p.quantity}</span></td>
                                    <td>${p.penalty_amount.toFixed(2)}€</td>
                                    <td><strong class="text-danger">${p.total_amount.toFixed(2)}€</strong></td>
                                    <td>${p.notes || '<span class="text-muted">-</span>'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div class="text-center py-4">
                    <i class="fas fa-search fa-3x text-muted mb-3"></i>
                    <h5>Keine Strafen gefunden</h5>
                    <p class="text-muted">Noch keine Strafen erfasst.</p>
                    <a href="/add" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Erste Strafe hinzufügen
                    </a>
                </div>
            `}
        </div>
    </div>`;

  return c.html(getHTML('Strafen', content, 'penalties'));
});

// Statistics
app.get('/statistics', async (c) => {
  const env = c.env;
  const dateFrom = c.req.query('date_from') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = c.req.query('date_to') || new Date().toISOString().split('T')[0];
  
  const stats = await db.getStats(env, dateFrom, dateTo);
  
  const content = `
    <div class="row">
        <div class="col-12">
            <h1 class="mb-4"><i class="fas fa-chart-bar"></i> Statistiken</h1>
        </div>
    </div>

    <div class="card mb-4">
        <div class="card-body">
            <form method="GET" class="row g-3 align-items-end">
                <div class="col-md-4">
                    <label for="date_from" class="form-label">Von Datum</label>
                    <input type="date" name="date_from" id="date_from" class="form-control" value="${dateFrom}">
                </div>
                <div class="col-md-4">
                    <label for="date_to" class="form-label">Bis Datum</label>
                    <input type="date" name="date_to" id="date_to" class="form-control" value="${dateTo}">
                </div>
                <div class="col-md-4">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-sync"></i> Aktualisieren
                    </button>
                </div>
            </form>
        </div>
    </div>

    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card text-white bg-primary">
                <div class="card-body text-center">
                    <i class="fas fa-list-ol fa-2x mb-2"></i>
                    <h3>${stats.totalCount}</h3>
                    <p class="mb-0">Gesamtstrafen</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-success">
                <div class="card-body text-center">
                    <i class="fas fa-euro-sign fa-2x mb-2"></i>
                    <h3>${stats.totalAmount.toFixed(2)}€</h3>
                    <p class="mb-0">Gesamtbetrag</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-warning">
                <div class="card-body text-center">
                    <i class="fas fa-calculator fa-2x mb-2"></i>
                    <h3>${stats.avgPerPenalty.toFixed(2)}€</h3>
                    <p class="mb-0">Ø pro Strafe</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-white bg-danger">
                <div class="card-body text-center">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <h3>${stats.maxPenalty.toFixed(2)}€</h3>
                    <p class="mb-0">Höchste Strafe</p>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-users"></i> Top Spieler (Zeitraum)</h5>
                </div>
                <div class="card-body">
                    ${stats.topPlayers.length ? `
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Spieler</th>
                                        <th class="text-center">Anzahl</th>
                                        <th class="text-end">Betrag</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.topPlayers.map(p => `
                                        <tr>
                                            <td>${p.name}</td>
                                            <td class="text-center">
                                                <span class="badge bg-primary">${p.count}</span>
                                            </td>
                                            <td class="text-end">
                                                <strong>${p.total.toFixed(2)}€</strong>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p class="text-muted">Keine Daten für den gewählten Zeitraum.</p>'}
                </div>
            </div>
        </div>
    </div>`;

  return c.html(getHTML('Statistiken', content, 'statistics'));
});

// CSV Export
app.get('/api/export/csv', async (c) => {
  const env = c.env;
  
  const penalties = await db.query(env, `
    SELECT 
      p.date,
      pl.name as player_name,
      pt.name as penalty_name,
      p.quantity,
      pt.amount as penalty_amount,
      (p.quantity * pt.amount) as total_amount,
      p.notes
    FROM penalties p
    JOIN players pl ON p.player_id = pl.id
    JOIN penalty_types pt ON p.penalty_type_id = pt.id
    ORDER BY p.date DESC
  `);

  let csv = 'Datum;Spieler;Vergehen;Anzahl;Einzelbetrag (€);Gesamt (€);Notiz\n';
  
  penalties.forEach(p => {
    csv += [
      p.date,
      p.player_name,
      p.penalty_name,
      p.quantity,
      p.penalty_amount.toFixed(2),
      p.total_amount.toFixed(2),
      p.notes || ''
    ].join(';') + '\n';
  });

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="penalty_export.csv"');
  return c.text(csv);
});

// Players management
app.get('/players', async (c) => {
  const env = c.env;
  const players = await db.query(env, 'SELECT * FROM players ORDER BY name');
  
  const content = `
    <div class="row">
        <div class="col-12">
            <h1 class="mb-4"><i class="fas fa-users"></i> Spieler verwalten</h1>
        </div>
    </div>

    <div class="row">
        <div class="col-md-4">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-user-plus"></i> Neuen Spieler hinzufügen</h5>
                </div>
                <form method="POST" action="/api/players">
                    <div class="card-body">
                        <div class="mb-3">
                            <label for="name" class="form-label">Spielername *</label>
                            <input type="text" class="form-control" id="name" name="name" 
                                   placeholder="Vor- und Nachname" required>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button type="submit" class="btn btn-success">
                            <i class="fas fa-plus"></i> Hinzufügen
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <div class="col-md-8">
            <div class="card">
                <div class="card-header">
                    <h5><i class="fas fa-list"></i> Spielerliste (${players.length} Spieler)</h5>
                </div>
                <div class="card-body">
                    ${players.length ? `
                        <div class="row">
                            ${players.map(p => `
                                <div class="col-md-6 mb-2">
                                    <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                                        <div>
                                            <strong>${p.name}</strong>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="text-center py-4">
                            <i class="fas fa-users fa-3x text-muted mb-3"></i>
                            <h5>Keine Spieler gefunden</h5>
                            <p class="text-muted">Fügen Sie den ersten Spieler hinzu.</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    </div>`;

  return c.html(getHTML('Spieler verwalten', content));
});

// Add player
app.post('/api/players', async (c) => {
  const env = c.env;
  const formData = await c.req.formData();
  const name = formData.get('name')?.trim();

  if (name) {
    try {
      await db.execute(env, 'INSERT INTO players (name) VALUES (?)', [name]);
    } catch (error) {
      // Player already exists or other error
    }
  }

  return c.redirect('/players');
});

export default app;