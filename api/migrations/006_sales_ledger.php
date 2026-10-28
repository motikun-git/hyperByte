<?php
// Sixth version: the private sales ledger (buy price, shipping, extra costs,
// selling price and profit), kept by month. Not connected to the products
// shown on the website, and never shown publicly.
declare(strict_types=1);
defined('HB_API') || exit;

$mysqlTable = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

return [
    'mysql' => [
        "CREATE TABLE IF NOT EXISTS ledger_months (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            ym CHAR(7) NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'open',
            note TEXT NULL,
            closed_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_ledger_months_ym (ym)
        ) $mysqlTable",
        "CREATE TABLE IF NOT EXISTS ledger_entries (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            month_id INT UNSIGNED NOT NULL,
            first_ym CHAR(7) NOT NULL,
            name VARCHAR(160) NOT NULL,
            cost_currency CHAR(3) NOT NULL DEFAULT 'CNY',
            cost_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            rate DECIMAL(9,4) NULL,
            shipping DECIMAL(12,2) NOT NULL DEFAULT 0,
            extra DECIMAL(12,2) NOT NULL DEFAULT 0,
            selling DECIMAL(12,2) NULL,
            sold TINYINT(1) NOT NULL DEFAULT 0,
            note VARCHAR(500) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            KEY idx_ledger_entries_month (month_id, sold),
            CONSTRAINT fk_ledger_entries_month FOREIGN KEY (month_id) REFERENCES ledger_months (id) ON DELETE RESTRICT
        ) $mysqlTable",
    ],
    'sqlite' => [
        "CREATE TABLE IF NOT EXISTS ledger_months (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ym TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'open',
            note TEXT NULL,
            closed_at TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS ledger_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month_id INTEGER NOT NULL REFERENCES ledger_months (id),
            first_ym TEXT NOT NULL,
            name TEXT NOT NULL,
            cost_currency TEXT NOT NULL DEFAULT 'CNY',
            cost_amount REAL NOT NULL DEFAULT 0,
            rate REAL NULL,
            shipping REAL NOT NULL DEFAULT 0,
            extra REAL NOT NULL DEFAULT 0,
            selling REAL NULL,
            sold INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_ledger_entries_month ON ledger_entries (month_id, sold)',
    ],
];
