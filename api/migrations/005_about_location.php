<?php
// Fifth version: new About text and the Rampura (Kunjaban) pickup location in
// the pre-order texts. Each old default is replaced only if the owner has not
// changed it.
declare(strict_types=1);
defined('HB_API') || exit;

return [
    'mysql' => [],
    'sqlite' => [],
    'after' => static function (): void {
        $oldDefaults = [
        'preorderInfo' => "## How pre-orders work\n1. Write the products you want in the form above and send the message to us on WhatsApp or Facebook.\n2. We buy pre-order products only on your demand, after you confirm the model and price with us.\n3. An advance of 1,000 to 5,000 taka is taken per product, depending on the product price. No payment is taken on this website.\n4. When the product arrives, receive it at our location in Khilgaon, Dhaka, or choose cash on delivery.",
        'preorderPolicy' => "- An advance is taken for each product, from 1,000 to 5,000 taka depending on the product price.\n- The final price and the expected arrival time are confirmed with you in the chat before we buy the product.\n- If we cannot find the product, HyperByte can refund your advance at any time.\n- Once the product has been bought for you, the pre-order advance cannot be refunded in any circumstance.\n- You can change the model before we buy the product. After it is bought, the model cannot be changed.\n- Delivery can be earlier or later than the estimate, because international shipping and customs are outside our control. We never delay a delivery on purpose, and we keep you updated in the chat.\n- The product's warranty policy applies to pre-ordered products too.\n- You can receive the product at our location in Khilgaon, Dhaka, or choose cash on delivery. The remaining amount is paid when you receive the product.\n- Keep your chat and the proof of your advance payment until you receive the product.",
        'aboutText' => "HyperByte sells second-hand PC components, graphics cards and laptops from Khilgaon, Dhaka.\n\nEvery listing shows real photos of the actual item, its condition and its specifications, so you know what you are getting. Ask us anything on WhatsApp or Facebook before you decide.",
        ];
        foreach ($oldDefaults as $name => $old) {
            $value = Db::value('SELECT value FROM settings WHERE name = ?', [$name]);
            if ($value !== null && json_decode((string) $value, true) === $old) {
                Db::run('DELETE FROM settings WHERE name = ?', [$name]);
            }
        }
    },
];
