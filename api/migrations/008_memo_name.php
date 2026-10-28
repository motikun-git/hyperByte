<?php
// Eighth version: the memo shows "hyperByte" instead of a person's name.
// Replaces the earlier default only if the owner has not changed it.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $value = Db::value("SELECT value FROM settings WHERE name = 'memoName'");
        if ($value !== null && json_decode((string) $value, true) === 'Motiur Rahman') {
            Db::run("DELETE FROM settings WHERE name = 'memoName'");
        }
    },
];
