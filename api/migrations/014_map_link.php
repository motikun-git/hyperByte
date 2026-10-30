<?php
// Fourteenth version: the shop's Google Maps link is filled in by default.
// A saved empty link is removed so the new default shows; a link the owner
// entered is left alone.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $value = Db::value("SELECT value FROM settings WHERE name = 'mapUrl'");
        if ($value !== null && json_decode((string) $value, true) === '') {
            Db::run("DELETE FROM settings WHERE name = 'mapUrl'");
        }
    },
];
