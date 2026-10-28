<?php
// Third version: new pre-order texts. If the owner never changed the old
// default "How pre-orders work" text, it is replaced by the new default.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $old = "## How pre-orders work\nSome items are not in stock in Dhaka yet, but we may be able to source them for you. These items have a Pre-order badge.\n\n## Steps\n1. Send a pre-order inquiry on WhatsApp or Facebook from the product page.\n2. We check availability and the current price with our sources.\n3. We tell you the expected price and timing. Nothing is confirmed until you agree.\n\n## Good to know\n- No payment is taken on this website.\n- Prices and arrival times can change until we confirm them with you.\n- An expected arrival time is only shown when we have a real estimate.";
        $value = Db::value("SELECT value FROM settings WHERE name = 'preorderInfo'");
        if ($value !== null && json_decode((string) $value, true) === $old) {
            Db::run("DELETE FROM settings WHERE name = 'preorderInfo'");
        }
    },
];
