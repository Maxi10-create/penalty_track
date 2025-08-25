-- Migration: Initial database schema
-- Created: 2025-08-25

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Penalty types table
CREATE TABLE IF NOT EXISTS penalty_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL DEFAULT 0.00,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Penalties table
CREATE TABLE IF NOT EXISTS penalties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    player_id INTEGER NOT NULL,
    penalty_type_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players (id),
    FOREIGN KEY (penalty_type_id) REFERENCES penalty_types (id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_penalties_date ON penalties(date);
CREATE INDEX IF NOT EXISTS idx_penalties_player ON penalties(player_id);
CREATE INDEX IF NOT EXISTS idx_penalties_type ON penalties(penalty_type_id);
CREATE INDEX IF NOT EXISTS idx_penalties_created ON penalties(created_at);