<?php
// Fifteenth version: the warranty policy lists every reason a warranty
// becomes void. A stored policy that still matches an old default is
// removed, so the new default shows; a policy the owner edited is left alone.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $new = Settings::DEFAULTS['warrantyPolicy'];
        $start = strpos($new, "## When a warranty becomes void\n");
        $end = strpos($new, "\n\n## Limits");
        if ($start === false || $end === false) {
            return;
        }
        $oldVoid = "## When a warranty becomes void\nThe warranty becomes void if the item was opened, repaired or modified by someone else, if stickers or labels were removed, or if the problem falls under What is not covered.";
        $old = substr($new, 0, $start) . $oldVoid . substr($new, $end);
        $olds = [];
        foreach ([$old, str_replace('Rampura, Dhaka', 'Khilgaon, Dhaka', $old)] as $text) {
            $olds[] = $text;
            $olds[] = str_replace('hyperByte', 'HyperByte', $text);
        }
        $value = Db::value("SELECT value FROM settings WHERE name = 'warrantyPolicy'");
        if ($value !== null && in_array(json_decode((string) $value, true), $olds, true)) {
            Db::run("DELETE FROM settings WHERE name = 'warrantyPolicy'");
        }
    },
];
