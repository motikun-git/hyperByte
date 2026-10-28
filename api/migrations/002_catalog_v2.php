<?php
// Second version: subcategories, pre-order details, internal stock reference,
// archived photos of sold products, and the pre-order / inquiry tracker.
declare(strict_types=1);
defined('HB_API') || exit;

$mysqlTable = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

return [
    'mysql' => [
        'ALTER TABLE categories
            ADD COLUMN parent_id INT UNSIGNED NULL AFTER id,
            ADD KEY idx_categories_parent (parent_id),
            ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT',
        "ALTER TABLE products
            ADD COLUMN subcategory_id INT UNSIGNED NULL AFTER category_id,
            ADD COLUMN expected_availability VARCHAR(120) NOT NULL DEFAULT '' AFTER status,
            ADD COLUMN stock_ref VARCHAR(120) NOT NULL DEFAULT '' AFTER expected_availability,
            ADD KEY idx_products_subcategory (subcategory_id),
            ADD CONSTRAINT fk_products_subcategory FOREIGN KEY (subcategory_id) REFERENCES categories (id) ON DELETE SET NULL",
        'ALTER TABLE product_images ADD COLUMN archived_at DATETIME NULL',
        "CREATE TABLE IF NOT EXISTS inquiries (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            ref VARCHAR(20) NOT NULL,
            product_id INT UNSIGNED NULL,
            product_name VARCHAR(160) NOT NULL,
            customer_name VARCHAR(80) NOT NULL DEFAULT '',
            customer_contact VARCHAR(120) NOT NULL DEFAULT '',
            inquiry_date DATE NOT NULL,
            expected_price INT UNSIGNED NULL,
            eta DATE NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'inquiry',
            notes TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_inquiries_ref (ref),
            KEY idx_inquiries_status (status, inquiry_date),
            KEY idx_inquiries_product (product_id),
            CONSTRAINT fk_inquiries_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
        ) $mysqlTable",
    ],

    'sqlite' => [
        'ALTER TABLE categories ADD COLUMN parent_id INTEGER NULL REFERENCES categories (id)',
        'CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id)',
        'ALTER TABLE products ADD COLUMN subcategory_id INTEGER NULL REFERENCES categories (id) ON DELETE SET NULL',
        "ALTER TABLE products ADD COLUMN expected_availability TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE products ADD COLUMN stock_ref TEXT NOT NULL DEFAULT ''",
        'CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory_id)',
        'ALTER TABLE product_images ADD COLUMN archived_at TEXT NULL',
        "CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ref TEXT NOT NULL UNIQUE,
            product_id INTEGER NULL REFERENCES products (id) ON DELETE SET NULL,
            product_name TEXT NOT NULL,
            customer_name TEXT NOT NULL DEFAULT '',
            customer_contact TEXT NOT NULL DEFAULT '',
            inquiry_date TEXT NOT NULL,
            expected_price INTEGER NULL,
            eta TEXT NULL,
            status TEXT NOT NULL DEFAULT 'inquiry',
            notes TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status, inquiry_date)',
    ],

    // More categories and the usual subcategories. Existing ones are kept;
    // anything can be renamed, hidden or removed later in Admin -> Categories.
    'after' => static function (): void {
        $now = Db::now();
        $find = static fn (string $slug) => Db::one('SELECT id FROM categories WHERE slug = ?', [$slug]);
        $order = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) FROM categories');
        $add = static function (array $c, ?int $parent) use (&$order, $now, $find): ?int {
            $existing = $find($c[1]);
            if ($existing) {
                return (int) $existing['id'];
            }
            return Db::insert('categories', [
                'parent_id' => $parent,
                'name' => $c[0],
                'slug' => $c[1],
                'icon' => $c[2],
                'description' => $c[3],
                'spec_keys' => json_encode($c[4]),
                'sort_order' => ++$order,
                'is_active' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        };

        // Spec fields in the order buyers look for them (brand and model have their own fields).
        $specOrder = [
            'gpu' => ['Chipset', 'VRAM', 'Memory type', 'Board partner', 'Boost clock', 'Interface', 'Power connector', 'Recommended PSU', 'Outputs'],
            'ram' => ['Capacity', 'Memory type', 'Speed', 'CAS latency (CL)', 'Modules', 'Voltage'],
            'cpu' => ['Generation', 'Cores / threads', 'Base clock', 'Boost clock', 'Socket', 'Cache', 'TDP', 'Integrated graphics'],
            'laptop' => ['Processor', 'RAM', 'Storage', 'Graphics', 'Display size', 'Resolution', 'Refresh rate', 'Battery health', 'Charger and accessories'],
            'storage' => ['Capacity', 'Interface', 'Form factor', 'Read speed', 'Health', 'Power-on hours'],
            'motherboard' => ['Socket', 'Chipset', 'Memory support', 'Form factor', 'M.2 slots', 'Connectivity'],
            'psu' => ['Wattage', 'Certification', 'Modularity', 'PCIe connectors'],
        ];
        foreach ($specOrder as $slug => $keys) {
            Db::run('UPDATE categories SET spec_keys = ?, updated_at = ? WHERE slug = ?', [json_encode($keys), $now, $slug]);
        }

        $top = [
            ['CPU cooler', 'cpu-coolers', 'fan', 'Air and liquid CPU coolers.', ['Type', 'Socket support', 'Radiator / height', 'Fans']],
            ['Cooling fans', 'fans', 'fan', 'Case fans and fan kits.', ['Size', 'Quantity', 'Connector', 'RGB']],
            ['PC case', 'cases', 'case', 'Desktop cases.', ['Form factor', 'Motherboard support', 'GPU length', 'Included fans']],
            ['Monitor', 'monitors', 'monitor', 'Gaming and office monitors.', ['Size', 'Resolution', 'Refresh rate', 'Panel', 'Inputs']],
            ['Keyboard', 'keyboards', 'keyboard', 'Mechanical and office keyboards.', ['Type', 'Switches', 'Layout', 'Connection']],
            ['Mouse', 'mice', 'mouse', 'Gaming and office mice.', ['Sensor', 'DPI', 'Connection', 'Weight']],
        ];
        foreach ($top as $c) {
            $add($c, null);
        }

        $children = [
            'gpu' => [
                ['NVIDIA GeForce', 'nvidia-geforce', 'gpu', '', []],
                ['AMD Radeon', 'amd-radeon', 'gpu', '', []],
                ['Other graphics', 'other-graphics', 'gpu', '', []],
            ],
            'ram' => [
                ['DDR3', 'ddr3', 'ram', '', []],
                ['DDR4', 'ddr4', 'ram', '', []],
                ['DDR5', 'ddr5', 'ram', '', []],
                ['Other memory', 'other-memory', 'ram', '', []],
            ],
            'storage' => [
                ['SATA SSD', 'sata-ssd', 'storage', '', []],
                ['NVMe SSD', 'nvme-ssd', 'storage', '', []],
                ['HDD', 'hdd', 'storage', '', []],
            ],
            'laptop' => [
                ['Gaming laptops', 'gaming-laptops', 'laptop', '', []],
                ['Office laptops', 'office-laptops', 'laptop', '', []],
                ['Other laptops', 'other-laptops', 'laptop', '', []],
            ],
        ];
        foreach ($children as $parentSlug => $list) {
            $parent = $find($parentSlug);
            if (!$parent) {
                continue;
            }
            foreach ($list as $c) {
                $add($c, (int) $parent['id']);
            }
        }
        // "Other accessories" stays last.
        Db::run('UPDATE categories SET sort_order = ? WHERE slug = ?', [++$order, 'accessories']);
    },
];
