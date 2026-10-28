<?php
// Seventh version: one warranty code can cover several products (a sales memo).
// - warranties  = the memo: code, invoice number, customer, phone, payment, discount
// - warranty_items = the products on it: quantity, serial numbers, price and
//   each product's own warranty period, so a GPU and a RAM stick on the same
//   memo can have different warranties.
// Existing warranties become memos with one product each; codes do not change.
declare(strict_types=1);
defined('HB_API') || exit;

$mysqlTable = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

return [
    'mysql' => [
        "ALTER TABLE warranties
            ADD COLUMN invoice_no VARCHAR(20) NULL AFTER code,
            ADD COLUMN phone_key VARCHAR(20) NOT NULL DEFAULT '' AFTER customer_phone,
            ADD COLUMN discount DECIMAL(12,2) NOT NULL DEFAULT 0,
            ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT '',
            ADD UNIQUE KEY uq_warranties_invoice (invoice_no),
            ADD KEY idx_warranties_phone (phone_key)",
        "CREATE TABLE IF NOT EXISTS warranty_items (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            warranty_id INT UNSIGNED NOT NULL,
            position INT UNSIGNED NOT NULL DEFAULT 0,
            product_id INT UNSIGNED NULL,
            product_name VARCHAR(160) NOT NULL,
            product_ref VARCHAR(80) NOT NULL DEFAULT '',
            quantity INT UNSIGNED NOT NULL DEFAULT 1,
            serials TEXT NULL,
            unit_price DECIMAL(12,2) NULL,
            warranty_value INT UNSIGNED NULL,
            warranty_unit VARCHAR(5) NOT NULL DEFAULT 'day',
            warranty_note VARCHAR(160) NOT NULL DEFAULT '',
            starts_at DATETIME NOT NULL,
            expires_at DATETIME NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'active',
            void_reason VARCHAR(300) NOT NULL DEFAULT '',
            voided_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            KEY idx_witems_warranty (warranty_id, position),
            KEY idx_witems_product (product_id),
            CONSTRAINT fk_witems_warranty FOREIGN KEY (warranty_id) REFERENCES warranties (id) ON DELETE CASCADE,
            CONSTRAINT fk_witems_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
        ) $mysqlTable",
    ],
    'sqlite' => [
        'ALTER TABLE warranties ADD COLUMN invoice_no TEXT NULL',
        "ALTER TABLE warranties ADD COLUMN phone_key TEXT NOT NULL DEFAULT ''",
        'ALTER TABLE warranties ADD COLUMN discount REAL NOT NULL DEFAULT 0',
        "ALTER TABLE warranties ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''",
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_warranties_invoice ON warranties (invoice_no)',
        'CREATE INDEX IF NOT EXISTS idx_warranties_phone ON warranties (phone_key)',
        "CREATE TABLE IF NOT EXISTS warranty_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warranty_id INTEGER NOT NULL REFERENCES warranties (id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            product_id INTEGER NULL REFERENCES products (id) ON DELETE SET NULL,
            product_name TEXT NOT NULL,
            product_ref TEXT NOT NULL DEFAULT '',
            quantity INTEGER NOT NULL DEFAULT 1,
            serials TEXT NULL,
            unit_price REAL NULL,
            warranty_value INTEGER NULL,
            warranty_unit TEXT NOT NULL DEFAULT 'day',
            warranty_note TEXT NOT NULL DEFAULT '',
            starts_at TEXT NOT NULL,
            expires_at TEXT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            void_reason TEXT NOT NULL DEFAULT '',
            voided_at TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_witems_warranty ON warranty_items (warranty_id, position)',
        'CREATE INDEX IF NOT EXISTS idx_witems_product ON warranty_items (product_id)',
    ],
    'after' => static function (): void {
        // Each old warranty becomes a memo with one product (its old period in days).
        foreach (Db::all('SELECT * FROM warranties') as $w) {
            if (Db::value('SELECT 1 FROM warranty_items WHERE warranty_id = ?', [(int) $w['id']])) {
                continue;
            }
            Db::insert('warranty_items', [
                'warranty_id' => (int) $w['id'],
                'position' => 0,
                'product_id' => $w['product_id'] === null ? null : (int) $w['product_id'],
                'product_name' => $w['product_name'],
                'product_ref' => (string) $w['product_ref'],
                'quantity' => 1,
                'serials' => '',
                'unit_price' => null,
                'warranty_value' => $w['duration_days'] === null ? null : (int) $w['duration_days'],
                'warranty_unit' => 'day',
                'warranty_note' => '',
                'starts_at' => $w['starts_at'],
                'expires_at' => $w['expires_at'],
                'status' => 'active',
                'void_reason' => '',
                'voided_at' => null,
                'created_at' => $w['created_at'],
                'updated_at' => $w['updated_at'],
            ]);
            Db::update('warranties', ['phone_key' => Warranty::phoneKey((string) $w['customer_phone'])], 'id = ?', [(int) $w['id']]);
        }
    },
];
