<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Products and categories: public queries, admin saving, photos, and the JSON shapes.
final class Catalog
{
    public const MAX_IMAGES = 10;

    // ---------------------------------------------------------------- shapes

    private static function specs(?string $json): array
    {
        $data = $json ? json_decode($json, true) : [];
        return is_array($data) ? array_values(array_filter($data, static fn ($s) => is_array($s) && isset($s['key'], $s['value']))) : [];
    }

    private static function imageShape(array $img): array
    {
        return [
            'id' => (int) $img['id'],
            'url' => $img['path'],
            'thumb' => $img['thumb_path'],
            'width' => (int) $img['width'],
            'height' => (int) $img['height'],
        ];
    }

    /** First photo and photo count for many products in one query (archived photos excluded). */
    private static function coverImages(array $productIds): array
    {
        if (!$productIds) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($productIds), '?'));
        $rows = Db::all(
            "SELECT id, product_id, path, thumb_path, width, height FROM product_images
             WHERE product_id IN ($marks) AND archived_at IS NULL ORDER BY product_id, sort_order, id",
            $productIds
        );
        $out = [];
        foreach ($rows as $row) {
            $pid = (int) $row['product_id'];
            if (!isset($out[$pid])) {
                $out[$pid] = ['cover' => self::imageShape($row), 'count' => 0];
            }
            $out[$pid]['count']++;
        }
        return $out;
    }

    private static function categoryShape(array $row): ?array
    {
        if (empty($row['category_slug'])) {
            return null;
        }
        return ['name' => $row['category_name'], 'slug' => $row['category_slug'], 'icon' => $row['category_icon']];
    }

    private static function discount(?int $price, ?int $original): int
    {
        if ($price === null || $original === null || $original <= $price || $original <= 0) {
            return 0;
        }
        return (int) round((1 - $price / $original) * 100);
    }

    public static function card(array $p, ?array $cover): array
    {
        $price = $p['price'] === null ? null : (int) $p['price'];
        $original = $p['original_price'] === null ? null : (int) $p['original_price'];
        return [
            'id' => $p['sku'],
            'slug' => $p['slug'],
            'name' => $p['name'],
            'brand' => $p['brand'],
            'model' => $p['model'],
            'category' => self::categoryShape($p),
            'subcategory' => !empty($p['subcategory_slug']) ? ['name' => $p['subcategory_name'], 'slug' => $p['subcategory_slug']] : null,
            'price' => $price,
            'originalPrice' => $original,
            'discountPct' => self::discount($price, $original),
            'condition' => $p['condition_grade'],
            'conditionLabel' => Util::CONDITIONS[$p['condition_grade']] ?? $p['condition_grade'],
            'status' => $p['status'],
            'expectedAvailability' => $p['status'] === 'preorder' ? (string) ($p['expected_availability'] ?? '') : '',
            'isFeatured' => (bool) (int) $p['is_featured'],
            'warrantyInfo' => $p['warranty_info'],
            'image' => $cover['cover'] ?? null,
            'imageCount' => $cover['count'] ?? 0,
            'specs' => array_slice(self::specs($p['specs']), 0, 3),
            'publishedAt' => Util::iso($p['published_at'] ?? null),
            'soldAt' => $p['status'] === 'sold' ? Util::iso($p['sold_at'] ?? null) : null,
        ];
    }

    private const FROM = 'FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories sc ON sc.id = p.subcategory_id';

    private const SELECT = 'SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
        sc.name AS subcategory_name, sc.slug AS subcategory_slug ' . self::FROM;

    /** @param array $rows product rows from SELECT */
    private static function cards(array $rows): array
    {
        $covers = self::coverImages(array_map(static fn ($r) => (int) $r['id'], $rows));
        return array_map(static fn ($r) => self::card($r, $covers[(int) $r['id']] ?? null), $rows);
    }

    // ---------------------------------------------------------------- public

    /** Statuses that appear in public lists. "Unavailable" products are only reachable by their own link. */
    private static function visibleStatuses(): array
    {
        return Settings::get('showSoldProducts') ? ['available', 'preorder', 'sold'] : ['available', 'preorder'];
    }

    /**
     * Public product list. Filters: category, sub (subcategory), q, status (comma list),
     * condition (comma list), min, max, featured, sort (newest|price_asc|price_desc|recently_sold),
     * page, limit (max 48).
     */
    public static function listPublic(array $f): array
    {
        $visible = self::visibleStatuses();
        $where = ['p.is_published = 1'];
        $params = [];

        // status: one value or a comma-separated list, e.g. "available,preorder" (everything for sale)
        $status = Util::line($f['status'] ?? '', 40);
        $requested = array_values(array_unique(array_filter(array_map('trim', explode(',', $status)))));
        $statuses = $requested ? array_values(array_intersect($visible, $requested)) : $visible;
        if (!$statuses) {
            return ['items' => [], 'total' => 0, 'page' => 1, 'pages' => 0, 'priceRange' => null];
        }
        $where[] = 'p.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
        array_push($params, ...$statuses);

        $category = Util::line($f['category'] ?? '', 80);
        if ($category !== '') {
            $where[] = '((c.slug = ? AND c.is_active = 1) OR (sc.slug = ? AND sc.is_active = 1))';
            array_push($params, $category, $category);
        }
        $sub = Util::line($f['sub'] ?? '', 80);
        if ($sub !== '') {
            $where[] = 'sc.slug = ? AND sc.is_active = 1';
            $params[] = $sub;
        }
        if (Util::bool($f['featured'] ?? false)) {
            $where[] = 'p.is_featured = 1';
        }

        // Price range is calculated before price/condition/search filters, for the filter inputs.
        $baseWhere = implode(' AND ', $where);
        $baseParams = $params;

        $conditions = array_values(array_intersect(
            array_map('trim', explode(',', Util::line($f['condition'] ?? '', 100))),
            array_keys(Util::CONDITIONS)
        ));
        if ($conditions) {
            $where[] = 'p.condition_grade IN (' . implode(',', array_fill(0, count($conditions), '?')) . ')';
            array_push($params, ...$conditions);
        }
        $min = Util::int($f['min'] ?? null);
        $max = Util::int($f['max'] ?? null);
        if ($min !== null) {
            $where[] = 'p.price IS NOT NULL AND p.price >= ?';
            $params[] = max(0, $min);
        }
        if ($max !== null) {
            $where[] = 'p.price IS NOT NULL AND p.price <= ?';
            $params[] = max(0, $max);
        }
        $words = array_slice(array_filter(preg_split('/\s+/u', mb_strtolower(Util::line($f['q'] ?? '', 80))) ?: []), 0, 6);
        foreach ($words as $word) {
            $where[] = "p.search_text LIKE ? ESCAPE '!'";
            $params[] = '%' . Util::likeEscape($word) . '%';
        }

        $order = match ($f['sort'] ?? 'newest') {
            'price_asc' => '(p.price IS NULL), p.price ASC, p.id DESC',
            'price_desc' => '(p.price IS NULL), p.price DESC, p.id DESC',
            'recently_sold' => '(p.sold_at IS NULL), p.sold_at DESC, p.id DESC',
            default => 'COALESCE(p.published_at, p.created_at) DESC, p.id DESC',
        };
        if (count($statuses) > 1 && in_array('sold', $statuses, true)) {
            $order = "(p.status = 'sold'), " . $order;
        }

        $limit = min(48, max(1, Util::int($f['limit'] ?? null, 24) ?? 24));
        $page = max(1, Util::int($f['page'] ?? null, 1) ?? 1);
        $offset = ($page - 1) * $limit;
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::value('SELECT COUNT(*) ' . self::FROM . " WHERE $whereSql", $params);
        $rows = Db::all(self::SELECT . " WHERE $whereSql ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        $range = Db::one('SELECT MIN(p.price) AS min_price, MAX(p.price) AS max_price ' . self::FROM . " WHERE $baseWhere AND p.price IS NOT NULL", $baseParams);

        return [
            'items' => self::cards($rows),
            'total' => $total,
            'page' => $page,
            'pages' => (int) ceil($total / $limit),
            'priceRange' => ($range && $range['min_price'] !== null)
                ? ['min' => (int) $range['min_price'], 'max' => (int) $range['max_price']]
                : null,
        ];
    }

    /** Active categories with product counts, each with its active subcategories in "children". */
    public static function publicCategories(): array
    {
        $visible = self::visibleStatuses();
        $marks = implode(',', array_fill(0, count($visible), '?'));
        $products = "SELECT p.category_id, p.subcategory_id, p.status FROM products p WHERE p.is_published = 1 AND p.status IN ($marks)";
        $counts = [];
        foreach (Db::all($products, $visible) as $p) {
            foreach (array_unique(array_filter([(int) $p['category_id'], (int) $p['subcategory_id']])) as $cid) {
                $counts[$cid] ??= ['available' => 0, 'preorder' => 0, 'total' => 0];
                $counts[$cid]['total']++;
                if (isset($counts[$cid][$p['status']])) {
                    $counts[$cid][$p['status']]++;
                }
            }
        }
        $rows = Db::all('SELECT id, parent_id, name, slug, icon, description FROM categories WHERE is_active = 1 ORDER BY sort_order, name');
        $shape = static fn ($r) => [
            'name' => $r['name'],
            'slug' => $r['slug'],
            'icon' => $r['icon'],
            'description' => $r['description'],
            'available' => $counts[(int) $r['id']]['available'] ?? 0,
            'preorder' => $counts[(int) $r['id']]['preorder'] ?? 0,
            'total' => $counts[(int) $r['id']]['total'] ?? 0,
        ];
        $top = [];
        foreach ($rows as $r) {
            if ($r['parent_id'] === null) {
                $top[(int) $r['id']] = $shape($r) + ['children' => []];
            }
        }
        foreach ($rows as $r) {
            if ($r['parent_id'] !== null && isset($top[(int) $r['parent_id']])) {
                $top[(int) $r['parent_id']]['children'][] = $shape($r);
            }
        }
        return array_values($top);
    }

    public static function home(): array
    {
        $visible = self::visibleStatuses();
        $newest = 'COALESCE(p.published_at, p.created_at) DESC, p.id DESC';
        $q = static fn (string $where, array $params, int $limit, string $order = '') => self::cards(
            Db::all(self::SELECT . " WHERE p.is_published = 1 AND $where ORDER BY " . ($order ?: $newest) . " LIMIT $limit", $params)
        );
        return [
            // Graphics cards first: they are hyperByte's main products.
            'featured' => $q("p.is_featured = 1 AND p.status IN ('available','preorder')", [], 10, "(c.slug = 'gpu') DESC, $newest"),
            'gpus' => $q("c.slug = 'gpu' AND p.status IN ('available','preorder')", [], 8, "p.is_featured DESC, $newest"),
            'available' => $q("p.status = 'available'", [], 12),
            'preorder' => $q("p.status = 'preorder'", [], 8),
            'recent' => $q("p.status IN ('available','preorder')", [], 8),
            'sold' => in_array('sold', $visible, true) ? $q("p.status = 'sold'", [], 8, '(p.sold_at IS NULL), p.sold_at DESC, p.id DESC') : [],
            'counts' => [
                'available' => (int) Db::value("SELECT COUNT(*) FROM products WHERE is_published = 1 AND status = 'available'"),
                'preorder' => (int) Db::value("SELECT COUNT(*) FROM products WHERE is_published = 1 AND status = 'preorder'"),
            ],
            'categories' => self::publicCategories(),
        ];
    }

    /** Full public product, or null if it does not exist or is unpublished. */
    public static function publicProduct(string $slug): ?array
    {
        $row = Db::one(self::SELECT . ' WHERE p.slug = ? AND p.is_published = 1', [$slug]);
        if (!$row) {
            return null;
        }
        $product = self::detail($row);
        $related = Db::all(
            self::SELECT . " WHERE p.is_published = 1 AND p.status IN ('available','preorder')
                AND p.category_id = ? AND p.id <> ? ORDER BY (p.subcategory_id = ?) DESC, COALESCE(p.published_at, p.created_at) DESC LIMIT 4",
            [$row['category_id'], $row['id'], $row['subcategory_id'] ?? 0]
        );
        return ['product' => $product, 'related' => self::cards($related)];
    }

    private static function detail(array $row): array
    {
        $images = array_map(
            [self::class, 'imageShape'],
            Db::all('SELECT * FROM product_images WHERE product_id = ? AND archived_at IS NULL ORDER BY sort_order, id', [$row['id']])
        );
        $card = self::card($row, $images ? ['cover' => $images[0], 'count' => count($images)] : null);
        return $card + [
            'images' => $images,
            'specs' => self::specs($row['specs']),
            'description' => (string) ($row['description'] ?? ''),
            'conditionNote' => $row['condition_note'],
            'warrantyDays' => $row['warranty_days'] === null ? null : (int) $row['warranty_days'],
            'updatedAt' => Util::iso($row['updated_at']),
        ];
    }

    // ---------------------------------------------------------------- admin

    public static function adminShape(array $row): array
    {
        $archived = Db::all('SELECT id, archived_at FROM product_images WHERE product_id = ? AND archived_at IS NOT NULL ORDER BY sort_order, id', [$row['id']]);
        return array_merge(self::detail($row), [
            'dbId' => (int) $row['id'],
            'sku' => $row['sku'],
            'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
            'subcategoryId' => $row['subcategory_id'] === null ? null : (int) $row['subcategory_id'],
            'expectedAvailability' => (string) ($row['expected_availability'] ?? ''),
            'stockRef' => (string) ($row['stock_ref'] ?? ''),
            'isPublished' => (bool) (int) $row['is_published'],
            'createdAt' => Util::iso($row['created_at']),
            'soldAt' => Util::iso($row['sold_at']),
            'archivedImages' => array_map(static fn ($a) => ['id' => (int) $a['id'], 'archivedAt' => Util::iso($a['archived_at'])], $archived),
        ]);
    }

    public static function adminProduct(int $id): array
    {
        $row = Db::one(self::SELECT . ' WHERE p.id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Product not found.');
        }
        return self::adminShape($row);
    }

    public static function adminList(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        $view = Util::line($f['view'] ?? '', 20);
        switch ($view) {
            case 'available':
            case 'preorder':
            case 'sold':
            case 'unavailable':
                $where[] = 'p.status = ? AND p.is_published = 1';
                $params[] = $view;
                break;
            case 'unpublished':
                $where[] = 'p.is_published = 0';
                break;
            case 'featured':
                $where[] = 'p.is_featured = 1';
                break;
        }
        $categoryId = Util::int($f['category'] ?? null);
        if ($categoryId) {
            $where[] = '(p.category_id = ? OR p.subcategory_id = ?)';
            array_push($params, $categoryId, $categoryId);
        }
        $words = array_slice(array_filter(preg_split('/\s+/u', mb_strtolower(Util::line($f['q'] ?? '', 80))) ?: []), 0, 6);
        foreach ($words as $word) {
            $where[] = "(p.search_text LIKE ? ESCAPE '!' OR LOWER(p.stock_ref) LIKE ? ESCAPE '!')";
            $like = '%' . Util::likeEscape($word) . '%';
            array_push($params, $like, $like);
        }
        $order = match ($f['sort'] ?? 'updated') {
            'newest' => 'p.created_at DESC, p.id DESC',
            'price_asc' => '(p.price IS NULL), p.price ASC',
            'price_desc' => '(p.price IS NULL), p.price DESC',
            'name' => 'p.name ASC',
            default => 'p.updated_at DESC, p.id DESC',
        };
        $limit = min(100, max(1, Util::int($f['limit'] ?? null, 30) ?? 30));
        $page = max(1, Util::int($f['page'] ?? null, 1) ?? 1);
        $offset = ($page - 1) * $limit;
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::value('SELECT COUNT(*) ' . self::FROM . " WHERE $whereSql", $params);
        $rows = Db::all(self::SELECT . " WHERE $whereSql ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        $covers = self::coverImages(array_map(static fn ($r) => (int) $r['id'], $rows));
        $items = array_map(static function ($r) use ($covers) {
            $card = self::card($r, $covers[(int) $r['id']] ?? null);
            return $card + [
                'dbId' => (int) $r['id'],
                'sku' => $r['sku'],
                'stockRef' => (string) ($r['stock_ref'] ?? ''),
                'isPublished' => (bool) (int) $r['is_published'],
                'warrantyDays' => $r['warranty_days'] === null ? null : (int) $r['warranty_days'],
                'updatedAt' => Util::iso($r['updated_at']),
            ];
        }, $rows);

        $counts = Db::one(
            "SELECT COUNT(*) AS total,
                SUM(CASE WHEN is_published = 1 AND status = 'available' THEN 1 ELSE 0 END) AS available,
                SUM(CASE WHEN is_published = 1 AND status = 'preorder' THEN 1 ELSE 0 END) AS preorder,
                SUM(CASE WHEN is_published = 1 AND status = 'sold' THEN 1 ELSE 0 END) AS sold,
                SUM(CASE WHEN is_published = 1 AND status = 'unavailable' THEN 1 ELSE 0 END) AS unavailable,
                SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) AS unpublished,
                SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) AS featured
             FROM products"
        ) ?? [];

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'pages' => (int) ceil($total / $limit),
            'counts' => array_map('intval', $counts),
        ];
    }

    private static function searchText(array $data, string $categoryName, string $subcategoryName = ''): string
    {
        $parts = [$data['name'], $data['brand'], $data['model'], $data['sku'] ?? '', $categoryName, $subcategoryName, Util::CONDITIONS[$data['condition_grade']] ?? ''];
        foreach (self::specs($data['specs']) as $spec) {
            $parts[] = $spec['key'] . ' ' . $spec['value'];
        }
        return mb_strtolower(implode(' ', array_filter($parts)));
    }

    /** Creates ($id = null) or updates a product from admin form input. */
    public static function save(?int $id, array $in): array
    {
        $existing = null;
        if ($id !== null) {
            $existing = Db::one('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$existing) {
                throw new HttpError(404, 'Product not found.');
            }
        }
        $errors = [];
        $data = [];

        $data['name'] = Util::line($in['name'] ?? '', 160);
        if (mb_strlen($data['name']) < 3) {
            $errors['name'] = 'Enter the product name (at least 3 characters).';
        }

        // Category and optional subcategory. Picking a subcategory as the category also works.
        $categoryId = Util::int($in['categoryId'] ?? null);
        $category = $categoryId ? Db::one('SELECT id, parent_id, name FROM categories WHERE id = ?', [$categoryId]) : null;
        $subcategory = null;
        if ($category && $category['parent_id'] !== null) {
            $subcategory = $category;
            $category = Db::one('SELECT id, parent_id, name FROM categories WHERE id = ?', [$category['parent_id']]);
        }
        if (!$category) {
            $errors['categoryId'] = 'Choose a category.';
        }
        $subId = Util::int($in['subcategoryId'] ?? null);
        if ($subId && !$subcategory) {
            $subcategory = Db::one('SELECT id, parent_id, name FROM categories WHERE id = ?', [$subId]);
            if (!$subcategory || !$category || (int) $subcategory['parent_id'] !== (int) $category['id']) {
                $errors['subcategoryId'] = 'Choose a subcategory of the selected category.';
                $subcategory = null;
            }
        }
        $data['category_id'] = $category ? (int) $category['id'] : null;
        $data['subcategory_id'] = $subcategory ? (int) $subcategory['id'] : null;
        $data['brand'] = Util::line($in['brand'] ?? '', 60);
        $data['model'] = Util::line($in['model'] ?? '', 100);

        $price = ($in['price'] ?? null) === null || $in['price'] === '' ? null : Util::int($in['price']);
        $original = ($in['originalPrice'] ?? null) === null || $in['originalPrice'] === '' ? null : Util::int($in['originalPrice']);
        if (($in['price'] ?? '') !== '' && ($in['price'] ?? null) !== null && ($price === null || $price < 0 || $price > 50_000_000)) {
            $errors['price'] = 'Enter the price in taka, or leave it empty for "Contact for price".';
        }
        if (($in['originalPrice'] ?? '') !== '' && ($in['originalPrice'] ?? null) !== null && ($original === null || $original < 0 || $original > 50_000_000)) {
            $errors['originalPrice'] = 'Enter a valid amount or leave it empty.';
        }
        if ($price !== null && $original !== null && $original <= $price) {
            $errors['originalPrice'] = 'The original price must be higher than the selling price.';
        }
        if ($price === null && $original !== null) {
            $errors['originalPrice'] = 'Set a selling price first, or leave the original price empty.';
        }
        $data['price'] = $price;
        $data['original_price'] = $original;

        $condition = Util::line($in['condition'] ?? '', 20);
        if (!isset(Util::CONDITIONS[$condition])) {
            $errors['condition'] = 'Choose the condition.';
        }
        $data['condition_grade'] = $condition;
        $data['condition_note'] = Util::line($in['conditionNote'] ?? '', 300);

        $status = Util::line($in['status'] ?? 'available', 20);
        if (!isset(Util::STATUSES[$status])) {
            $errors['status'] = 'Choose Available now, Pre-order, Sold out or Unavailable.';
        }
        $data['status'] = $status;
        $data['expected_availability'] = Util::line($in['expectedAvailability'] ?? '', 120);
        $data['stock_ref'] = Util::line($in['stockRef'] ?? '', 120);
        $data['is_published'] = Util::bool($in['isPublished'] ?? false) ? 1 : 0;
        $data['is_featured'] = Util::bool($in['isFeatured'] ?? false) ? 1 : 0;
        $data['warranty_info'] = Util::line($in['warrantyInfo'] ?? '', 200);
        $warrantyDays = ($in['warrantyDays'] ?? '') === '' || ($in['warrantyDays'] ?? null) === null ? null : Util::int($in['warrantyDays']);
        if ($warrantyDays !== null && ($warrantyDays < 0 || $warrantyDays > 3650)) {
            $errors['warrantyDays'] = 'Enter 0 to 3650 days, or leave it empty.';
        }
        $data['warranty_days'] = $warrantyDays;
        $data['description'] = Util::str($in['description'] ?? '', 20000);

        $specs = [];
        foreach (is_array($in['specs'] ?? null) ? $in['specs'] : [] as $spec) {
            if (!is_array($spec)) {
                continue;
            }
            $key = Util::line($spec['key'] ?? '', 60);
            $value = Util::line($spec['value'] ?? '', 200);
            if ($key !== '' && $value !== '') {
                $specs[] = ['key' => $key, 'value' => $value];
            }
        }
        $data['specs'] = json_encode(array_slice($specs, 0, 60), JSON_UNESCAPED_UNICODE);

        $sku = strtoupper(Util::line($in['sku'] ?? '', 40));
        if ($sku !== '') {
            if (!preg_match('/^[A-Z0-9][A-Z0-9-]{2,39}$/', $sku)) {
                $errors['sku'] = 'Use 3 to 40 letters, numbers or dashes.';
            } elseif (Db::value('SELECT id FROM products WHERE sku = ? AND id <> ?', [$sku, $id ?? 0])) {
                $errors['sku'] = 'Another product already uses this ID.';
            }
        }

        if ($errors) {
            throw HttpError::validation($errors);
        }

        $now = Db::now();
        $data['updated_at'] = $now;
        if ($data['is_published'] && (!$existing || !$existing['published_at'])) {
            $data['published_at'] = $now;
        }
        if ($data['status'] === 'sold') {
            $data['sold_at'] = $existing['sold_at'] ?? null ?: $now;
        } else {
            $data['sold_at'] = null;
        }
        $subName = $subcategory['name'] ?? '';

        $savedId = Db::transaction(static function () use ($id, $data, $sku, $category, $subName, $existing, $now) {
            if ($id === null) {
                $temp = 'TMP-' . bin2hex(random_bytes(6));
                $data['sku'] = $temp;
                $data['slug'] = strtolower($temp);
                $data['created_at'] = $now;
                $data['search_text'] = '';
                $id = Db::insert('products', $data);
                $finalSku = $sku !== '' ? $sku : 'HB-' . (1000 + $id);
                if ($sku === '' && Db::value('SELECT id FROM products WHERE sku = ? AND id <> ?', [$finalSku, $id])) {
                    $finalSku = 'HB-' . (1000 + $id) . '-' . Util::randomCode(3);
                }
                $slugBase = Util::slugify($data['name'], 90) ?: 'product';
                $data['sku'] = $finalSku;
                Db::update('products', [
                    'sku' => $finalSku,
                    'slug' => $slugBase . '-' . strtolower($finalSku),
                    'search_text' => self::searchText($data, $category['name'], $subName),
                ], 'id = ?', [$id]);
            } else {
                $data['sku'] = $sku !== '' ? $sku : $existing['sku'];
                $data['search_text'] = self::searchText($data, $category['name'], $subName);
                Db::update('products', $data, 'id = ?', [$id]);
            }
            return $id;
        });

        // Photos are moved only after the product change is safely saved.
        self::afterStatusChange($savedId, $existing['status'] ?? null, $data['status']);
        return self::adminProduct($savedId);
    }

    /** Small changes from the product list: status, published, featured. */
    public static function quickUpdate(int $id, array $in): array
    {
        $row = Db::one('SELECT * FROM products WHERE id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Product not found.');
        }
        $data = ['updated_at' => Db::now()];
        if (array_key_exists('status', $in)) {
            $status = Util::line($in['status'], 20);
            if (!isset(Util::STATUSES[$status])) {
                throw HttpError::validation(['status' => 'Unknown status.']);
            }
            $data['status'] = $status;
            $data['sold_at'] = $status === 'sold' ? ($row['sold_at'] ?: Db::now()) : null;
        }
        if (array_key_exists('isPublished', $in)) {
            $data['is_published'] = Util::bool($in['isPublished']) ? 1 : 0;
            if ($data['is_published'] && !$row['published_at']) {
                $data['published_at'] = Db::now();
            }
        }
        if (array_key_exists('isFeatured', $in)) {
            $data['is_featured'] = Util::bool($in['isFeatured']) ? 1 : 0;
        }
        Db::update('products', $data, 'id = ?', [$id]);
        if (isset($data['status'])) {
            self::afterStatusChange($id, $row['status'], $data['status']);
        }
        return self::adminProduct($id);
    }

    public static function delete(int $id): array
    {
        $row = Db::one('SELECT id, name, sku FROM products WHERE id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Product not found.');
        }
        $images = Db::all('SELECT path, thumb_path, archived_at FROM product_images WHERE product_id = ?', [$id]);
        Db::transaction(static function () use ($id) {
            Db::run('DELETE FROM product_images WHERE product_id = ?', [$id]);
            Db::run('UPDATE warranties SET product_id = NULL WHERE product_id = ?', [$id]);
            Db::run('UPDATE warranty_items SET product_id = NULL WHERE product_id = ?', [$id]);
            Db::run('UPDATE inquiries SET product_id = NULL WHERE product_id = ?', [$id]);
            Db::run('DELETE FROM products WHERE id = ?', [$id]);
        });
        foreach ($images as $img) {
            if ($img['archived_at']) {
                Images::deleteArchived($img['path']);
                Images::deleteArchived($img['thumb_path']);
            } else {
                Images::delete($img['path']);
                Images::delete($img['thumb_path']);
            }
        }
        return $row;
    }

    // ---------------------------------------------------------------- sold photo cleanup

    private static function afterStatusChange(int $id, ?string $old, string $new): void
    {
        if ($new === 'sold' && $old !== 'sold') {
            self::archiveExtraPhotos($id);
        } elseif ($old === 'sold' && $new !== 'sold') {
            self::restoreArchivedPhotos($id);
        }
    }

    /**
     * When a product is sold, keep the cover photo and move the others to the
     * archive (if Settings > Sold products is set to do so). Each photo is only
     * marked archived after its files were moved; failures leave it in place.
     */
    public static function archiveExtraPhotos(int $productId): int
    {
        if (Settings::get('soldPhotoPolicy') !== 'archive') {
            return 0;
        }
        $images = Db::all('SELECT * FROM product_images WHERE product_id = ? AND archived_at IS NULL ORDER BY sort_order, id', [$productId]);
        $count = 0;
        foreach (array_slice($images, 1) as $img) {
            if (Images::archive([$img['path'], $img['thumb_path']])) {
                Db::update('product_images', ['archived_at' => Db::now()], 'id = ?', [$img['id']]);
                $count++;
            }
        }
        return $count;
    }

    /** Brings archived photos back (when a sold product is put back on sale, or by the admin). */
    public static function restoreArchivedPhotos(int $productId): int
    {
        $images = Db::all('SELECT * FROM product_images WHERE product_id = ? AND archived_at IS NOT NULL ORDER BY sort_order, id', [$productId]);
        $count = 0;
        foreach ($images as $img) {
            if (Images::unarchive([$img['path'], $img['thumb_path']])) {
                Db::update('product_images', ['archived_at' => null], 'id = ?', [$img['id']]);
                $count++;
            }
        }
        if ($count) {
            Db::update('products', ['updated_at' => Db::now()], 'id = ?', [$productId]);
        }
        return $count;
    }

    /**
     * Permanently deletes archived photos older than the retention period
     * (Settings > soldPhotoRetentionDays; 0 keeps them forever). Returns how many were deleted.
     */
    public static function purgeArchive(): int
    {
        $days = (int) Settings::get('soldPhotoRetentionDays');
        if ($days <= 0) {
            return 0;
        }
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $rows = Db::all('SELECT id, path, thumb_path FROM product_images WHERE archived_at IS NOT NULL AND archived_at < ? LIMIT 500', [$cutoff]);
        foreach ($rows as $img) {
            Db::run('DELETE FROM product_images WHERE id = ?', [$img['id']]);
            Images::deleteArchived($img['path']);
            Images::deleteArchived($img['thumb_path']);
        }
        return count($rows);
    }

    // ---------------------------------------------------------------- photos

    public static function addImages(int $productId, array $files): array
    {
        if (!Db::value('SELECT id FROM products WHERE id = ?', [$productId])) {
            throw new HttpError(404, 'Product not found.');
        }
        $files = array_values(array_filter($files, static fn ($f) => ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE));
        if (!$files) {
            throw new HttpError(422, 'Choose at least one photo.');
        }
        $existing = (int) Db::value('SELECT COUNT(*) FROM product_images WHERE product_id = ? AND archived_at IS NULL', [$productId]);
        if ($existing + count($files) > self::MAX_IMAGES) {
            throw new HttpError(422, 'A product can have up to ' . self::MAX_IMAGES . ' photos. Remove some first.');
        }
        $order = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) FROM product_images WHERE product_id = ?', [$productId]);
        $saved = [];
        try {
            foreach ($files as $file) {
                $saved[] = Images::store($file, 'products');
            }
        } catch (Throwable $e) {
            foreach ($saved as $s) {
                Images::delete($s['path']);
                Images::delete($s['thumb']);
            }
            throw $e;
        }
        foreach ($saved as $s) {
            Db::insert('product_images', [
                'product_id' => $productId,
                'path' => $s['path'],
                'thumb_path' => $s['thumb'],
                'width' => $s['width'],
                'height' => $s['height'],
                'sort_order' => ++$order,
                'created_at' => Db::now(),
            ]);
        }
        Db::update('products', ['updated_at' => Db::now()], 'id = ?', [$productId]);
        return self::adminProduct($productId);
    }

    public static function deleteImage(int $productId, int $imageId): array
    {
        $img = Db::one('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [$imageId, $productId]);
        if (!$img) {
            throw new HttpError(404, 'Photo not found.');
        }
        Db::run('DELETE FROM product_images WHERE id = ?', [$imageId]);
        if ($img['archived_at']) {
            Images::deleteArchived($img['path']);
            Images::deleteArchived($img['thumb_path']);
        } else {
            Images::delete($img['path']);
            Images::delete($img['thumb_path']);
        }
        Db::update('products', ['updated_at' => Db::now()], 'id = ?', [$productId]);
        return self::adminProduct($productId);
    }

    /** $ids: photo ids in the new order (first = cover photo). Archived photos are not part of it. */
    public static function reorderImages(int $productId, array $ids): array
    {
        $current = array_map('intval', array_column(
            Db::all('SELECT id FROM product_images WHERE product_id = ? AND archived_at IS NULL', [$productId]),
            'id'
        ));
        $ids = array_values(array_unique(array_map('intval', $ids)));
        sort($current);
        $check = $ids;
        sort($check);
        if ($check !== $current) {
            throw new HttpError(422, 'The photo list changed. Reload the page and try again.');
        }
        Db::transaction(static function () use ($ids) {
            foreach ($ids as $i => $imageId) {
                Db::update('product_images', ['sort_order' => $i + 1], 'id = ?', [$imageId]);
            }
        });
        Db::update('products', ['updated_at' => Db::now()], 'id = ?', [$productId]);
        return self::adminProduct($productId);
    }

    // ---------------------------------------------------------------- categories

    public static function adminCategories(): array
    {
        $rows = Db::all('SELECT * FROM categories ORDER BY sort_order, name');
        $counts = [];
        foreach (Db::all('SELECT category_id, subcategory_id FROM products') as $p) {
            foreach (array_unique(array_filter([(int) $p['category_id'], (int) $p['subcategory_id']])) as $cid) {
                $counts[$cid] = ($counts[$cid] ?? 0) + 1;
            }
        }
        $shape = static fn ($c) => [
            'id' => (int) $c['id'],
            'parentId' => $c['parent_id'] === null ? null : (int) $c['parent_id'],
            'name' => $c['name'],
            'slug' => $c['slug'],
            'icon' => $c['icon'],
            'description' => $c['description'],
            'specKeys' => json_decode((string) ($c['spec_keys'] ?? '[]'), true) ?: [],
            'sortOrder' => (int) $c['sort_order'],
            'isActive' => (bool) (int) $c['is_active'],
            'productCount' => $counts[(int) $c['id']] ?? 0,
        ];
        // Each category followed by its subcategories.
        $out = [];
        foreach ($rows as $c) {
            if ($c['parent_id'] !== null) {
                continue;
            }
            $out[] = $shape($c);
            foreach ($rows as $child) {
                if ((int) $child['parent_id'] === (int) $c['id'] && $child['parent_id'] !== null) {
                    $out[] = $shape($child);
                }
            }
        }
        return $out;
    }

    public static function saveCategory(?int $id, array $in): array
    {
        $errors = [];
        if ($id !== null && !Db::value('SELECT id FROM categories WHERE id = ?', [$id])) {
            throw new HttpError(404, 'Category not found.');
        }
        $name = Util::line($in['name'] ?? '', 60);
        if (mb_strlen($name) < 2) {
            $errors['name'] = 'Enter a name.';
        }
        $slug = Util::slugify(Util::line($in['slug'] ?? '', 80) ?: $name);
        if ($slug === '') {
            $errors['slug'] = 'Use letters or numbers.';
        } elseif (Db::value('SELECT id FROM categories WHERE slug = ? AND id <> ?', [$slug, $id ?? 0])) {
            $errors['slug'] = 'Another category uses this link name.';
        }
        $parentId = Util::int($in['parentId'] ?? null) ?: null;
        if ($parentId !== null) {
            $parent = Db::one('SELECT id, parent_id FROM categories WHERE id = ?', [$parentId]);
            if (!$parent || $parent['parent_id'] !== null || $parentId === $id) {
                $errors['parentId'] = 'Choose a main category (subcategories cannot have their own subcategories).';
            } elseif ($id !== null && Db::value('SELECT id FROM categories WHERE parent_id = ?', [$id])) {
                $errors['parentId'] = 'This category has subcategories, so it cannot become a subcategory itself.';
            } elseif ($id !== null && Db::value('SELECT id FROM products WHERE category_id = ?', [$id])) {
                $errors['parentId'] = 'Products use this as their main category. Move them first.';
            }
        }
        $icon = Util::line($in['icon'] ?? 'other', 20);
        if (!in_array($icon, Util::CATEGORY_ICONS, true)) {
            $icon = 'other';
        }
        $keys = $in['specKeys'] ?? [];
        if (is_string($keys)) {
            $keys = preg_split('/[,\n]/', $keys) ?: [];
        }
        $keys = array_slice(array_values(array_unique(array_filter(array_map(static fn ($k) => Util::line($k, 60), is_array($keys) ? $keys : [])))), 0, 30);
        if ($errors) {
            throw HttpError::validation($errors);
        }
        $data = [
            'parent_id' => $parentId,
            'name' => $name,
            'slug' => $slug,
            'icon' => $icon,
            'description' => Util::line($in['description'] ?? '', 300),
            'spec_keys' => json_encode($keys, JSON_UNESCAPED_UNICODE),
            'sort_order' => Util::int($in['sortOrder'] ?? null, 0) ?? 0,
            'is_active' => array_key_exists('isActive', $in) ? (Util::bool($in['isActive']) ? 1 : 0) : 1,
            'updated_at' => Db::now(),
        ];
        if ($id === null) {
            $data['created_at'] = Db::now();
            $id = Db::insert('categories', $data);
        } else {
            Db::update('categories', $data, 'id = ?', [$id]);
            // Keep product search text up to date with the new name.
            self::refreshSearchText($id);
        }
        foreach (self::adminCategories() as $c) {
            if ($c['id'] === $id) {
                return $c;
            }
        }
        throw new HttpError(500, 'Could not load the category.');
    }

    private static function refreshSearchText(int $categoryId): void
    {
        $names = array_column(Db::all('SELECT id, name FROM categories'), 'name', 'id');
        foreach (Db::all('SELECT * FROM products WHERE category_id = ? OR subcategory_id = ?', [$categoryId, $categoryId]) as $p) {
            Db::update('products', [
                'search_text' => self::searchText($p, $names[$p['category_id']] ?? '', $names[$p['subcategory_id']] ?? ''),
            ], 'id = ?', [$p['id']]);
        }
    }

    public static function deleteCategory(int $id): array
    {
        $category = Db::one('SELECT id, name FROM categories WHERE id = ?', [$id]);
        if (!$category) {
            throw new HttpError(404, 'Category not found.');
        }
        $children = (int) Db::value('SELECT COUNT(*) FROM categories WHERE parent_id = ?', [$id]);
        if ($children > 0) {
            throw new HttpError(409, "\"{$category['name']}\" has $children subcategor" . ($children === 1 ? 'y' : 'ies') . '. Delete or move them first, or hide this category instead.');
        }
        $count = (int) Db::value('SELECT COUNT(*) FROM products WHERE category_id = ? OR subcategory_id = ?', [$id, $id]);
        if ($count > 0) {
            throw new HttpError(409, "$count product" . ($count === 1 ? ' is' : 's are') . " still in \"{$category['name']}\". Move them to another category first, or hide this category instead.");
        }
        Db::run('DELETE FROM categories WHERE id = ?', [$id]);
        return $category;
    }
}
