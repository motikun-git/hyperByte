<?php
// First version of the database: admins, categories, products, photos,
// warranties, settings, activity log and rate limits.
declare(strict_types=1);
defined('HB_API') || exit;

$mysqlTable = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

return [
    'mysql' => [
        "CREATE TABLE IF NOT EXISTS admins (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            email VARCHAR(160) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            last_login_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_admins_email (email)
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS categories (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(60) NOT NULL,
            slug VARCHAR(80) NOT NULL,
            icon VARCHAR(20) NOT NULL DEFAULT 'other',
            description VARCHAR(300) NOT NULL DEFAULT '',
            spec_keys TEXT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_categories_slug (slug)
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS products (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            sku VARCHAR(40) NOT NULL,
            slug VARCHAR(120) NOT NULL,
            name VARCHAR(160) NOT NULL,
            brand VARCHAR(60) NOT NULL DEFAULT '',
            model VARCHAR(100) NOT NULL DEFAULT '',
            category_id INT UNSIGNED NULL,
            price INT UNSIGNED NULL,
            original_price INT UNSIGNED NULL,
            condition_grade VARCHAR(20) NOT NULL DEFAULT 'good',
            condition_note VARCHAR(300) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'available',
            is_published TINYINT(1) NOT NULL DEFAULT 0,
            is_featured TINYINT(1) NOT NULL DEFAULT 0,
            warranty_info VARCHAR(200) NOT NULL DEFAULT '',
            warranty_days INT UNSIGNED NULL,
            description TEXT NULL,
            specs TEXT NULL,
            search_text TEXT NULL,
            published_at DATETIME NULL,
            sold_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_products_sku (sku),
            UNIQUE KEY uq_products_slug (slug),
            KEY idx_products_public (is_published, status, published_at),
            KEY idx_products_category (category_id),
            CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS product_images (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            product_id INT UNSIGNED NOT NULL,
            path VARCHAR(255) NOT NULL,
            thumb_path VARCHAR(255) NOT NULL,
            width INT UNSIGNED NOT NULL DEFAULT 0,
            height INT UNSIGNED NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            KEY idx_images_product (product_id, sort_order),
            CONSTRAINT fk_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS warranties (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(20) NOT NULL,
            product_id INT UNSIGNED NULL,
            product_name VARCHAR(160) NOT NULL,
            product_ref VARCHAR(80) NOT NULL DEFAULT '',
            starts_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            duration_days INT UNSIGNED NULL,
            terms TEXT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'active',
            void_reason VARCHAR(300) NOT NULL DEFAULT '',
            voided_at DATETIME NULL,
            customer_name VARCHAR(80) NOT NULL DEFAULT '',
            customer_phone VARCHAR(30) NOT NULL DEFAULT '',
            internal_notes TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uq_warranties_code (code),
            KEY idx_warranties_status (status, expires_at),
            KEY idx_warranties_product (product_id),
            CONSTRAINT fk_warranties_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS settings (
            name VARCHAR(100) NOT NULL PRIMARY KEY,
            value MEDIUMTEXT NOT NULL,
            updated_at DATETIME NOT NULL
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS activity_log (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            admin_id INT UNSIGNED NULL,
            admin_name VARCHAR(80) NOT NULL DEFAULT '',
            action VARCHAR(40) NOT NULL,
            entity VARCHAR(30) NOT NULL DEFAULT '',
            entity_id INT UNSIGNED NULL,
            summary VARCHAR(300) NOT NULL DEFAULT '',
            ip VARCHAR(45) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL,
            KEY idx_activity_created (created_at)
        ) $mysqlTable",

        "CREATE TABLE IF NOT EXISTS rate_limits (
            bucket VARCHAR(190) NOT NULL PRIMARY KEY,
            hits INT UNSIGNED NOT NULL,
            reset_at INT UNSIGNED NOT NULL
        ) $mysqlTable",
    ],

    'sqlite' => [
        'CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_login_at TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )',
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            icon TEXT NOT NULL DEFAULT 'other',
            description TEXT NOT NULL DEFAULT '',
            spec_keys TEXT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            brand TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            category_id INTEGER NULL REFERENCES categories (id) ON DELETE RESTRICT,
            price INTEGER NULL,
            original_price INTEGER NULL,
            condition_grade TEXT NOT NULL DEFAULT 'good',
            condition_note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'available',
            is_published INTEGER NOT NULL DEFAULT 0,
            is_featured INTEGER NOT NULL DEFAULT 0,
            warranty_info TEXT NOT NULL DEFAULT '',
            warranty_days INTEGER NULL,
            description TEXT NULL,
            specs TEXT NULL,
            search_text TEXT NULL,
            published_at TEXT NULL,
            sold_at TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_products_public ON products (is_published, status, published_at)',
        'CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id)',
        'CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
            path TEXT NOT NULL,
            thumb_path TEXT NOT NULL,
            width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )',
        'CREATE INDEX IF NOT EXISTS idx_images_product ON product_images (product_id, sort_order)',
        "CREATE TABLE IF NOT EXISTS warranties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            product_id INTEGER NULL REFERENCES products (id) ON DELETE SET NULL,
            product_name TEXT NOT NULL,
            product_ref TEXT NOT NULL DEFAULT '',
            starts_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            duration_days INTEGER NULL,
            terms TEXT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            void_reason TEXT NOT NULL DEFAULT '',
            voided_at TEXT NULL,
            customer_name TEXT NOT NULL DEFAULT '',
            customer_phone TEXT NOT NULL DEFAULT '',
            internal_notes TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_warranties_status ON warranties (status, expires_at)',
        'CREATE INDEX IF NOT EXISTS idx_warranties_product ON warranties (product_id)',
        'CREATE TABLE IF NOT EXISTS settings (
            name TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )',
        "CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NULL,
            admin_name TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            entity TEXT NOT NULL DEFAULT '',
            entity_id INTEGER NULL,
            summary TEXT NOT NULL DEFAULT '',
            ip TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )",
        'CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at)',
        'CREATE TABLE IF NOT EXISTS rate_limits (
            bucket TEXT PRIMARY KEY,
            hits INTEGER NOT NULL,
            reset_at INTEGER NOT NULL
        )',
    ],

    // The product categories HyperByte sells. Edit them later in Admin -> Categories.
    'after' => static function (): void {
        if ((int) Db::value('SELECT COUNT(*) FROM categories') > 0) {
            return;
        }
        $now = Db::now();
        $categories = [
            ['CPU', 'cpu', 'cpu', 'Desktop processors from Intel and AMD.', ['Cores / threads', 'Base clock', 'Boost clock', 'Socket', 'Cache', 'TDP', 'Integrated graphics']],
            ['GPU', 'gpu', 'gpu', 'Graphics cards from NVIDIA and AMD.', ['Chipset', 'Memory', 'Bus width', 'Boost clock', 'Power connector', 'Recommended PSU', 'Outputs']],
            ['RAM', 'ram', 'ram', 'DDR3, DDR4 and DDR5 memory.', ['Capacity', 'Type', 'Speed', 'Latency', 'Modules']],
            ['SSD & HDD', 'storage', 'storage', 'SSDs and hard drives.', ['Capacity', 'Interface', 'Form factor', 'Read speed', 'Health', 'Power-on hours']],
            ['Motherboard', 'motherboard', 'motherboard', 'Boards for Intel and AMD sockets.', ['Socket', 'Chipset', 'Form factor', 'Memory slots', 'Memory type', 'M.2 slots']],
            ['PSU', 'psu', 'psu', 'Power supply units.', ['Wattage', 'Efficiency', 'Modular', 'PCIe connectors']],
            ['Laptop', 'laptop', 'laptop', 'Business and gaming laptops.', ['Processor', 'RAM', 'Storage', 'Display', 'Graphics', 'Battery health']],
            ['Other accessories', 'accessories', 'other', 'PC cases, coolers, monitors and other parts.', ['Type', 'Compatibility']],
        ];
        foreach ($categories as $i => [$name, $slug, $icon, $description, $specKeys]) {
            Db::insert('categories', [
                'name' => $name,
                'slug' => $slug,
                'icon' => $icon,
                'description' => $description,
                'spec_keys' => json_encode($specKeys),
                'sort_order' => $i + 1,
                'is_active' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    },
];
