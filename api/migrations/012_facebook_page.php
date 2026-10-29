<?php
// Twelfth version: the Facebook Page link is https://www.facebook.com/hyperByteCn.
// Replaces the earlier default share link only if the owner has not changed it.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $value = Db::value("SELECT value FROM settings WHERE name = 'facebookUrl'");
        $old = $value === null ? null : json_decode((string) $value, true);
        if (in_array($old, ['https://www.facebook.com/share/1Dfme1Zbwy/', ''], true)) {
            Db::run("DELETE FROM settings WHERE name = 'facebookUrl'");
        }
    },
];
