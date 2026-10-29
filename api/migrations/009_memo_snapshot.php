<?php
// Ninth version: each memo is saved exactly as it was issued (customer,
// products, prices, warranty lines, date, shop details), so it can be
// downloaded again later and look the same, even if settings change.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => ['ALTER TABLE warranties ADD COLUMN memo_snapshot MEDIUMTEXT NULL'],
    'sqlite' => ['ALTER TABLE warranties ADD COLUMN memo_snapshot TEXT NULL'],
    'after' => static function (): void {
        foreach (Db::all('SELECT id FROM warranties WHERE memo_snapshot IS NULL') as $row) {
            Warranty::saveSnapshot((int) $row['id']);
        }
    },
];
