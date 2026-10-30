<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Everything the owner can change in Admin -> Settings. Stored as
// name/value rows; missing values fall back to these defaults.
final class Settings
{
    public const DEFAULTS = [
        'siteName' => 'hyperByte',
        'tagline' => 'Second-hand PC hardware and laptops',
        'logoUrl' => '',
        'heroTitle' => 'BUILD SMARTER. POWER BETTER.',
        'heroPhrases' => ['Premium PC hardware.', 'Better value for your next build.', 'Graphics cards. Components. Laptops.', 'Available products. Pre-order opportunities.'],
        'heroText' => 'Quality-checked second-hand PC components and laptops from Rampura, Dhaka. See real photos and full specs, then talk to us directly on WhatsApp or Facebook.',
        'whatsappNumber' => '',
        // Second WhatsApp contact for the China side (pre-orders sourced from China).
        'whatsappNumberCn' => '',
        'facebookUrl' => 'https://www.facebook.com/hyperByteCn',
        // The Facebook Page's message box (Messenger). Used by the Facebook chat buttons.
        'messengerUrl' => 'https://m.me/hyperByteCn',
        'phone' => '',
        'email' => '',
        'address' => 'Rampura, Dhaka, Bangladesh',
        'mapUrl' => 'https://maps.app.goo.gl/npmfULqKhCbhBbHbA',
        'hours' => '',
        'youtubeUrl' => '',
        'instagramUrl' => 'https://www.instagram.com/hyperbyte_cn',
        'tiktokUrl' => '',
        'showSoldProducts' => true,
        // When a product is marked sold: "archive" keeps the cover photo and moves the other
        // photos to a private archive (deleted after soldPhotoRetentionDays; 0 = never), "keep" changes nothing.
        'soldPhotoPolicy' => 'archive',
        'soldPhotoRetentionDays' => 90,
        'customBuildMessage' => 'Hello hyperByte, I would like to discuss a custom PC build. Please help me with compatible components and pricing.',
        'warrantyPolicyReviewed' => false,
        'warrantyPolicy' => "## What the warranty covers\nItems sold with a hyperByte warranty are covered for the period on your receipt, which is also shown on the Warranty check page. The warranty covers faults that appear during normal use and were not caused after purchase.\n\n## What is not covered\n- Physical damage: cracks, bent pins, broken connectors or ports\n- Burn marks, liquid damage or damage from power problems\n- Removed, torn or changed warranty stickers or serial labels\n- Problems caused by overclocking, mining, modified firmware or BIOS\n- Normal wear and cosmetic marks\n- Software, drivers and data on the device\n\n## How the warranty period is calculated\nThe warranty starts on the purchase date and lasts for the period written on your receipt. The Warranty check page shows the exact end date and how much time is left, based on our records.\n\n## How to check your warranty\nEnter the code from your receipt (it starts with HBW) on the Warranty check page.\n\n## How to make a claim\n1. Message hyperByte on WhatsApp or Facebook with your warranty code and a short description of the problem.\n2. Bring the item and your warranty code to hyperByte in Rampura, Dhaka.\n3. We test the item and tell you the result and the next steps.\n\n## What to bring or send\n- Your warranty code\n- The item, with its warranty sticker in place\n- A short description of the problem, with photos or a video if possible\n\n## When a warranty becomes void\nThe warranty becomes void if any of these apply:\n- The item was opened, repaired or modified by someone other than hyperByte\n- Physical damage: cracks, bent pins, broken connectors or ports\n- Burn marks, liquid damage or damage from power problems\n- Warranty stickers or serial labels were removed, torn or changed\n- Overclocking, mining, or modified firmware or BIOS\n- Any other problem listed under What is not covered\n\n## Limits\nThe solution (for example repair or replacement) is decided by hyperByte after testing. The warranty covers the item itself, not other parts, data or lost time.",
        'preorderPolicy' => "- An advance is taken for each product, from 1,000 to 5,000 taka depending on the product price.\n- The final price and the expected arrival time are confirmed with you in the chat before we buy the product.\n- If we cannot find the product, hyperByte can refund your advance at any time.\n- Once the product has been bought for you, the pre-order advance cannot be refunded in any circumstance.\n- You can change the model before we buy the product. After it is bought, the model cannot be changed.\n- Delivery can be earlier or later than the estimate, because international shipping and customs are outside our control. We never delay a delivery on purpose, and we keep you updated in the chat.\n- The product's warranty policy applies to pre-ordered products too.\n- You can receive the product at our location in Rampura (Kunjaban), Dhaka, or choose cash on delivery. The remaining amount is paid when you receive the product.\n- Keep your chat and the proof of your advance payment until you receive the product.",
        'aboutText' => "## Our story\nhyperByte started its journey in 2024. Customers in Bangladesh reach us through Facebook, and we bring the PC components they need from China on pre-order, especially graphics cards (GPUs), RAM and laptops.\n\n## How we work\n1. You tell us what you need on Facebook or WhatsApp.\n2. We confirm the model, the price and the expected arrival time with you before we buy anything.\n3. We bring the product from China, and you receive it in Dhaka at our location or by cash on delivery.\n\nWe also sell quality-checked pre-owned parts. Every listing shows real photos of the actual item, its condition and its specifications, so you know what you are getting.\n\n## What we stand for\n- Honesty: real photos, clear condition and straight answers about price and delivery time.\n- Reliable after-sales service and support: we stay in touch after the sale and help with warranty claims and questions.\n- Customer satisfaction: we want every customer to come back, so we take the time to get each order right.",
        'warrantyTerms' => "This warranty covers the item named above for the period shown, against faults that were not caused after purchase.\n\nIt does not cover physical damage, burns, liquid damage, removed or tampered warranty stickers, or problems caused by overclocking or modified firmware.\n\nTo make a claim, bring the item and this verification code to hyperByte.",
        // Printed at the bottom of the sales memo (admin only, not shown on the website).
        'memoName' => 'hyperByte',
        'memoAddress' => 'Mariam Mart, Kunjaban Road, Rampura, Dhaka',
        'memoPhone' => '01537613582',
        'memoFacebook' => 'facebook.com/_hyperbyte',
        // The website address used in the memo's QR code and "check your warranty" line.
        'memoSiteUrl' => 'https://yourhyperbyte.com',
        'metaDescription' => 'hyperByte sells quality-checked second-hand PC components and laptops in Dhaka: graphics cards, processors, RAM, SSDs, motherboards, power supplies and more.',
    ];

    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $values = self::DEFAULTS;
        try {
            foreach (Db::all('SELECT name, value FROM settings') as $row) {
                if (array_key_exists($row['name'], self::DEFAULTS)) {
                    $decoded = json_decode((string) $row['value'], true);
                    if ($decoded !== null || $row['value'] === 'null') {
                        $values[$row['name']] = $decoded;
                    }
                }
            }
        } catch (Throwable) {
            // Database not set up yet: use defaults.
        }
        return self::$cache = $values;
    }

    public static function get(string $name): mixed
    {
        return self::all()[$name] ?? null;
    }

    /** Safe for the public website. */
    public static function publicValues(): array
    {
        $s = self::all();
        return [
            'siteName' => $s['siteName'],
            'tagline' => $s['tagline'],
            'logoUrl' => $s['logoUrl'],
            'heroTitle' => $s['heroTitle'],
            'heroPhrases' => array_values(array_filter((array) $s['heroPhrases'])),
            'heroText' => $s['heroText'],
            'whatsappNumber' => $s['whatsappNumber'],
            'whatsappNumberCn' => $s['whatsappNumberCn'],
            'facebookUrl' => $s['facebookUrl'],
            'messengerUrl' => $s['messengerUrl'],
            'phone' => $s['phone'],
            'email' => $s['email'],
            'address' => $s['address'],
            'mapUrl' => $s['mapUrl'],
            'hours' => $s['hours'],
            'youtubeUrl' => $s['youtubeUrl'],
            'instagramUrl' => $s['instagramUrl'],
            'tiktokUrl' => $s['tiktokUrl'],
            'showSoldProducts' => (bool) $s['showSoldProducts'],
            'warrantyTerms' => $s['warrantyTerms'],
            'metaDescription' => $s['metaDescription'],
            'customBuildMessage' => $s['customBuildMessage'],
            'warrantyPolicy' => $s['warrantyPolicy'],
            'warrantyPolicyReviewed' => (bool) $s['warrantyPolicyReviewed'],
            'preorderPolicy' => $s['preorderPolicy'],
            'aboutText' => $s['aboutText'],
        ];
    }

    /** Validates and saves the fields present in $input. Returns the new values. */
    public static function update(array $input): array
    {
        $errors = [];
        $clean = [];
        $text = static function (string $key, int $max) use ($input, &$clean): void {
            if (array_key_exists($key, $input)) {
                $clean[$key] = Util::str($input[$key], $max);
            }
        };
        $line = static function (string $key, int $max) use ($input, &$clean): void {
            if (array_key_exists($key, $input)) {
                $clean[$key] = Util::line($input[$key], $max);
            }
        };

        $line('siteName', 60);
        $line('tagline', 120);
        $line('heroTitle', 80);
        $text('heroText', 400);
        $line('address', 200);
        $line('hours', 120);
        $text('warrantyTerms', 4000);
        $text('metaDescription', 300);
        $text('customBuildMessage', 500);
        $text('warrantyPolicy', 20000);
        $text('preorderPolicy', 10000);
        $text('aboutText', 10000);
        $line('memoName', 80);
        $line('memoAddress', 200);
        $line('memoPhone', 40);
        $line('memoFacebook', 120);
        if (array_key_exists('memoSiteUrl', $input)) {
            $url = Util::url(Util::line($input['memoSiteUrl'], 200));
            if ($url === '') {
                $errors['memoSiteUrl'] = 'Enter the website address, like https://yourhyperbyte.com';
            }
            $clean['memoSiteUrl'] = rtrim($url, '/');
        }
        if (isset($clean['siteName']) && mb_strlen($clean['siteName']) < 2) {
            $errors['siteName'] = 'Enter the site name.';
        }

        if (array_key_exists('heroPhrases', $input)) {
            $phrases = is_array($input['heroPhrases']) ? $input['heroPhrases'] : explode("\n", (string) $input['heroPhrases']);
            $clean['heroPhrases'] = array_slice(array_values(array_filter(array_map(
                static fn ($p) => Util::line($p, 60),
                $phrases
            ))), 0, 6);
        }

        foreach (['whatsappNumber' => 'like 8801712345678', 'whatsappNumberCn' => 'like 8613812345678'] as $key => $example) {
            if (array_key_exists($key, $input)) {
                $raw = Util::line($input[$key], 30);
                $number = Util::whatsappNumber($raw);
                if ($raw !== '' && $number === '') {
                    $errors[$key] = "Enter the number with country code, $example.";
                } elseif ($key === 'whatsappNumberCn' && $raw === '') {
                    $errors[$key] = "The Admin (CN) WhatsApp number is required, $example.";
                }
                $clean[$key] = $number;
            }
        }
        if (array_key_exists('phone', $input)) {
            $clean['phone'] = Util::line($input['phone'], 30);
        }
        if (array_key_exists('email', $input)) {
            $email = Util::line($input['email'], 160);
            if ($email !== '' && !Util::isEmail($email)) {
                $errors['email'] = 'Enter a valid email address.';
            }
            $clean['email'] = $email;
        }
        foreach (['facebookUrl', 'messengerUrl', 'mapUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl'] as $key) {
            if (array_key_exists($key, $input)) {
                $raw = Util::line($input[$key], 300);
                $url = Util::url($raw);
                if ($raw !== '' && $url === '') {
                    $errors[$key] = 'Enter a full link starting with https://';
                }
                $clean[$key] = $url;
            }
        }
        if (array_key_exists('showSoldProducts', $input)) {
            $clean['showSoldProducts'] = Util::bool($input['showSoldProducts']);
        }
        if (array_key_exists('warrantyPolicyReviewed', $input)) {
            $clean['warrantyPolicyReviewed'] = Util::bool($input['warrantyPolicyReviewed']);
        }
        if (array_key_exists('soldPhotoPolicy', $input)) {
            $policy = Util::line($input['soldPhotoPolicy'], 20);
            if (!in_array($policy, ['archive', 'keep'], true)) {
                $errors['soldPhotoPolicy'] = 'Choose what happens to the photos of sold products.';
            }
            $clean['soldPhotoPolicy'] = $policy;
        }
        if (array_key_exists('soldPhotoRetentionDays', $input)) {
            $days = Util::int($input['soldPhotoRetentionDays']);
            if ($days === null || $days < 0 || $days > 3650) {
                $errors['soldPhotoRetentionDays'] = 'Enter 0 to 3650 days (0 keeps archived photos forever).';
            }
            $clean['soldPhotoRetentionDays'] = $days ?? 90;
        }

        if ($errors) {
            throw HttpError::validation($errors);
        }
        foreach ($clean as $name => $value) {
            self::set($name, $value);
        }
        self::$cache = null;
        return self::all();
    }

    public static function set(string $name, mixed $value): void
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $updated = Db::update('settings', ['value' => $json, 'updated_at' => Db::now()], 'name = ?', [$name]);
        if ($updated === 0 && !Db::value('SELECT 1 FROM settings WHERE name = ?', [$name])) {
            Db::insert('settings', ['name' => $name, 'value' => $json, 'updated_at' => Db::now()]);
        }
        self::$cache = null;
    }
}
