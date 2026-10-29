<?php
// Eleventh version: the brand is written "hyperByte" everywhere, and the
// Facebook chat buttons open the Page's message box (m.me/hyperByteCn).
// Stored texts that still match an old default are removed, so the new
// default shows; texts the owner changed are left alone.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        foreach (Settings::DEFAULTS as $name => $default) {
            if (!is_string($default) || !str_contains($default, 'hyperByte')) {
                continue;
            }
            $old = str_replace('hyperByte', 'HyperByte', $default);
            $value = Db::value('SELECT value FROM settings WHERE name = ?', [$name]);
            if ($value !== null && json_decode((string) $value, true) === $old) {
                Db::run('DELETE FROM settings WHERE name = ?', [$name]);
            }
        }
        $messenger = Db::value("SELECT value FROM settings WHERE name = 'messengerUrl'");
        if ($messenger !== null && json_decode((string) $messenger, true) === '') {
            Db::run("DELETE FROM settings WHERE name = 'messengerUrl'");
        }
    },
];
