<?php
// Fourth version: a fuller default pre-order policy. Replaces the earlier
// default only if the owner has not changed it.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $old = "- An advance is taken for each product, from 1,000 to 5,000 taka depending on the product price.\n- If we cannot find the product, HyperByte can refund your advance at any time.\n- The product's warranty policy applies to pre-ordered products too.\n- Once the product has been bought for you, the pre-order advance cannot be refunded in any circumstance.\n- You can receive the product at our location, or choose cash on delivery.\n- You can change the model before we buy the product. After it is bought, the model cannot be changed.";
        $value = Db::value("SELECT value FROM settings WHERE name = 'preorderPolicy'");
        if ($value !== null && json_decode((string) $value, true) === $old) {
            Db::run("DELETE FROM settings WHERE name = 'preorderPolicy'");
        }
    },
];
