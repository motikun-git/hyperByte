<?php
// Thirteenth version: the shop's location is Rampura, Dhaka (was Khilgaon).
// Stored texts that still match the old default are removed, so the new
// default shows; texts the owner changed are left alone.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        foreach (Settings::DEFAULTS as $name => $default) {
            if (!is_string($default) || !str_contains($default, 'Rampura, Dhaka')) {
                continue;
            }
            $old = str_replace('Rampura, Dhaka', 'Khilgaon, Dhaka', $default);
            $olds = [$old, str_replace('hyperByte', 'HyperByte', $old)];
            $value = Db::value('SELECT value FROM settings WHERE name = ?', [$name]);
            if ($value !== null && in_array(json_decode((string) $value, true), $olds, true)) {
                Db::run('DELETE FROM settings WHERE name = ?', [$name]);
            }
        }
    },
];
