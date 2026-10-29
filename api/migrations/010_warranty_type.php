<?php
// Tenth version: each product on a memo has either a "Warranty" or a
// "Service Warranty". Existing products become "Warranty", and the saved
// memos are refreshed once so their warranty lines match.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => ["ALTER TABLE warranty_items ADD COLUMN warranty_type VARCHAR(10) NOT NULL DEFAULT 'warranty' AFTER warranty_unit"],
    'sqlite' => ["ALTER TABLE warranty_items ADD COLUMN warranty_type TEXT NOT NULL DEFAULT 'warranty'"],
    'after' => static function (): void {
        foreach (Db::all('SELECT id FROM warranties') as $row) {
            Warranty::saveSnapshot((int) $row['id']);
        }
    },
];
