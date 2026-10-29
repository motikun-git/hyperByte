<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Warranty memos. One code (HBW-XXXX-XXXX) covers one sale, which can hold
// several products. Each product line has its own quantity, serial numbers,
// price and warranty period. The customer's phone is stored with the memo so
// the admin can find a lost code; it is never shown on the website.
// Status (active / expired / void) is always decided here from stored dates.
final class Warranty
{
    public const PAYMENT_METHODS = ['transfer' => 'Account transfer', 'cash' => 'Cash', 'mobile' => 'Mobile banking'];
    public const UNITS = ['day' => ['Day', 'Days'], 'month' => ['Month', 'Months'], 'year' => ['Year', 'Years']];
    public const TYPES = ['warranty' => 'Warranty', 'service' => 'Service Warranty'];
    private const MAX_ITEMS = 30;
    private const MAX_QTY = 99;

    // ------------------------------------------------------------------ codes and numbers

    /** Unpredictable code like HBW-7KQ2-9XMA (no 0/O/1/I to avoid typos). */
    public static function newCode(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $code = 'HBW-' . Util::randomCode(4) . '-' . Util::randomCode(4);
            if (!Db::value('SELECT id FROM warranties WHERE code = ?', [$code])) {
                return $code;
            }
        }
        throw new HttpError(500, 'Could not create a unique code. Please try again.');
    }

    /** Accepts "hbw 7kq2 9xma", "HBW7KQ29XMA" or "7KQ2-9XMA" and returns "HBW-7KQ2-9XMA" (or ""). */
    public static function normalizeCode(mixed $value): string
    {
        $raw = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', Util::line($value, 40)) ?? '');
        if (str_starts_with($raw, 'HBW')) {
            $raw = substr($raw, 3);
        }
        if (strlen($raw) !== 8) {
            return '';
        }
        return 'HBW-' . substr($raw, 0, 4) . '-' . substr($raw, 4, 4);
    }

    /** "01712-345678", "+880 1712 345678" and "8801712345678" all become "01712345678". */
    public static function phoneKey(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (preg_match('/^8801\d{9}$/', $digits)) {
            return substr($digits, 2);
        }
        return $digits;
    }

    /** Memo number: Dhaka date + a running number for that day, like 2610280003. */
    private static function newInvoiceNo(): string
    {
        $prefix = (new DateTimeImmutable('now', new DateTimeZone('Asia/Dhaka')))->format('ymd');
        $n = (int) Db::value('SELECT COUNT(*) FROM warranties WHERE invoice_no LIKE ?', [$prefix . '%']);
        for ($i = 1; $i < 50; $i++) {
            $no = $prefix . str_pad((string) ($n + $i), 4, '0', STR_PAD_LEFT);
            if (!Db::value('SELECT 1 FROM warranties WHERE invoice_no = ?', [$no])) {
                return $no;
            }
        }
        throw new HttpError(500, 'Could not create a memo number. Please try again.');
    }

    // ------------------------------------------------------------------ status

    private static function ts(?string $db): ?int
    {
        return $db === null || $db === '' ? null : (int) strtotime($db . ' UTC');
    }

    public static function itemStatus(array $item, bool $memoVoid, ?int $now = null): string
    {
        if ($memoVoid || $item['status'] === 'void') {
            return 'void';
        }
        if ($item['expires_at'] === null || $item['expires_at'] === '') {
            return 'none';
        }
        return self::ts($item['expires_at']) <= ($now ?? time()) ? 'expired' : 'active';
    }

    /** The memo's overall status: active if any product still has warranty. */
    private static function memoStatus(array $memo, array $itemStatuses): string
    {
        if ($memo['status'] === 'void') {
            return 'void';
        }
        foreach (['active', 'expired', 'void'] as $s) {
            if (in_array($s, $itemStatuses, true)) {
                return $s;
            }
        }
        return 'none';
    }

    public static function periodLabel(?int $value, string $unit): string
    {
        if (!$value) {
            return '';
        }
        $names = self::UNITS[$unit] ?? self::UNITS['day'];
        return $value . ' ' . ($value === 1 ? $names[0] : $names[1]);
    }

    private static function addPeriod(DateTimeImmutable $start, int $value, string $unit): DateTimeImmutable
    {
        if ($unit === 'day') {
            return $start->modify("+$value days");
        }
        $months = $unit === 'year' ? $value * 12 : $value;
        return $start->setTimezone(new DateTimeZone('Asia/Dhaka'))->modify("+$months months")->setTimezone(new DateTimeZone('UTC'));
    }

    private static function serialList(?string $text): array
    {
        return array_values(array_filter(array_map('trim', explode("\n", (string) $text)), static fn ($s) => $s !== ''));
    }

    // ------------------------------------------------------------------ reading

    private static function itemsFor(int $warrantyId): array
    {
        return Db::all(
            'SELECT i.*, p.slug AS linked_slug, p.is_published AS linked_published
             FROM warranty_items i LEFT JOIN products p ON p.id = i.product_id
             WHERE i.warranty_id = ? ORDER BY i.position ASC, i.id ASC',
            [$warrantyId]
        );
    }

    public static function find(int $id): array
    {
        $row = Db::one('SELECT * FROM warranties WHERE id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Warranty record not found.');
        }
        return $row;
    }

    /** What anyone with the code may see: products, serial numbers, periods. No customer, prices or notes. */
    public static function publicView(array $memo): array
    {
        $now = time();
        $memoVoid = $memo['status'] === 'void';
        $items = [];
        $statuses = [];
        foreach (self::itemsFor((int) $memo['id']) as $it) {
            $status = self::itemStatus($it, $memoVoid, $now);
            $statuses[] = $status;
            $items[] = [
                'name' => $it['product_name'],
                'ref' => $it['product_ref'],
                'slug' => (int) ($it['linked_published'] ?? 0) === 1 ? $it['linked_slug'] : null,
                'quantity' => (int) $it['quantity'],
                'serials' => self::serialList($it['serials']),
                'period' => self::periodLabel($it['warranty_value'] === null ? null : (int) $it['warranty_value'], $it['warranty_unit']),
                'note' => $it['warranty_note'],
                'type' => self::TYPES[$it['warranty_type'] ?? 'warranty'] ?? 'Warranty',
                'startsAt' => Util::iso($it['starts_at']),
                'expiresAt' => Util::iso($it['expires_at']),
                'status' => $status,
            ];
        }
        return [
            'found' => true,
            'code' => $memo['code'],
            'purchasedAt' => Util::iso($memo['starts_at']),
            'status' => self::memoStatus($memo, $statuses),
            'items' => $items,
            'terms' => (string) ($memo['terms'] ?? ''),
            'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }

    public static function lookup(string $code): ?array
    {
        $row = Db::one('SELECT * FROM warranties WHERE code = ?', [$code]);
        return $row ? self::publicView($row) : null;
    }

    public static function adminView(array $memo): array
    {
        $now = time();
        $memoVoid = $memo['status'] === 'void';
        $items = [];
        $statuses = [];
        $subtotal = 0.0;
        $priced = true;
        foreach (self::itemsFor((int) $memo['id']) as $it) {
            $status = self::itemStatus($it, $memoVoid, $now);
            $statuses[] = $status;
            $price = $it['unit_price'] === null ? null : (float) $it['unit_price'];
            $qty = (int) $it['quantity'];
            if ($price === null) {
                $priced = false;
            } else {
                $subtotal += $price * $qty;
            }
            $expires = self::ts($it['expires_at']);
            $items[] = [
                'id' => (int) $it['id'],
                'productId' => $it['product_id'] === null ? null : (int) $it['product_id'],
                'productName' => $it['product_name'],
                'productRef' => $it['product_ref'],
                'productSlug' => $it['linked_slug'] ?? null,
                'quantity' => $qty,
                'serials' => self::serialList($it['serials']),
                'unitPrice' => $price,
                'amount' => $price === null ? null : round($price * $qty, 2),
                'warrantyValue' => $it['warranty_value'] === null ? null : (int) $it['warranty_value'],
                'warrantyUnit' => $it['warranty_unit'],
                'period' => self::periodLabel($it['warranty_value'] === null ? null : (int) $it['warranty_value'], $it['warranty_unit']),
                'warrantyNote' => $it['warranty_note'],
                'warrantyType' => isset(self::TYPES[$it['warranty_type'] ?? '']) ? $it['warranty_type'] : 'warranty',
                'typeLabel' => self::TYPES[$it['warranty_type'] ?? 'warranty'] ?? 'Warranty',
                'startsAt' => Util::iso($it['starts_at']),
                'expiresAt' => Util::iso($it['expires_at']),
                'remainingSeconds' => $expires === null ? 0 : max(0, $expires - $now),
                'status' => $status,
                'voidReason' => $it['void_reason'],
                'voidedAt' => Util::iso($it['voided_at']),
            ];
        }
        $discount = (float) $memo['discount'];
        $status = self::memoStatus($memo, $statuses);
        $expires = self::ts($memo['expires_at']);
        $view = [
            'id' => (int) $memo['id'],
            'code' => $memo['code'],
            'invoiceNo' => $memo['invoice_no'],
            'productName' => $memo['product_name'],
            'items' => $items,
            'itemCount' => count($items),
            'subtotal' => round($subtotal, 2),
            'discount' => $discount,
            'total' => round(max(0, $subtotal - $discount), 2),
            'allPriced' => $priced,
            'paymentMethod' => $memo['payment_method'],
            'paymentLabel' => self::PAYMENT_METHODS[$memo['payment_method']] ?? '',
            'startsAt' => Util::iso($memo['starts_at']),
            'expiresAt' => Util::iso($memo['expires_at']),
            'remainingSeconds' => $expires === null ? 0 : max(0, $expires - $now),
            'terms' => (string) ($memo['terms'] ?? ''),
            'status' => $status,
            'voidReason' => $memo['void_reason'],
            'voidedAt' => Util::iso($memo['voided_at']),
            'customerName' => $memo['customer_name'],
            'customerPhone' => $memo['customer_phone'],
            'internalNotes' => (string) ($memo['internal_notes'] ?? ''),
            'createdAt' => Util::iso($memo['created_at']),
            'updatedAt' => Util::iso($memo['updated_at']),
        ];
        // The memo as it was issued (used to download it again). Older records fall back to the current data.
        $saved = isset($memo['memo_snapshot']) && $memo['memo_snapshot'] ? json_decode((string) $memo['memo_snapshot'], true) : null;
        $view['memo'] = is_array($saved) ? $saved : self::memoFromView($view);
        return $view;
    }

    /** "15 Days Replacement | 2 Years Service Warranty" or "... | 6 Months Warranty" */
    public static function memoLine(string $note, string $period, string $type = 'warranty'): string
    {
        $label = self::TYPES[$type] ?? 'Warranty';
        return implode(' | ', array_filter([$note, $period !== '' ? "$period $label" : '']));
    }

    /** Everything printed on the memo, frozen at the time it is saved. */
    public static function memoFromView(array $v): array
    {
        $s = Settings::all();
        return [
            'version' => 1,
            'savedAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'code' => $v['code'],
            'invoiceNo' => $v['invoiceNo'],
            'date' => $v['startsAt'],
            'customerName' => $v['customerName'],
            'customerPhone' => $v['customerPhone'],
            'items' => array_map(static fn ($it) => [
                'name' => $it['productName'],
                'quantity' => $it['quantity'],
                'serials' => $it['serials'],
                'unitPrice' => $it['unitPrice'],
                'amount' => $it['amount'],
                'line' => self::memoLine((string) $it['warrantyNote'], (string) $it['period'], (string) $it['warrantyType']),
            ], $v['items']),
            'subtotal' => $v['subtotal'],
            'discount' => $v['discount'],
            'total' => $v['total'],
            'payment' => $v['paymentLabel'],
            'seller' => [
                'name' => (string) $s['memoName'],
                'address' => (string) $s['memoAddress'],
                'phone' => (string) $s['memoPhone'],
                'facebook' => (string) $s['memoFacebook'],
                'site' => rtrim((string) $s['memoSiteUrl'], '/'),
            ],
        ];
    }

    /** Saves the memo as it looks now. Called when a memo is created or edited, never on extend or void. */
    public static function saveSnapshot(int $id): void
    {
        $memo = self::find($id);
        $memo['memo_snapshot'] = null;
        $json = json_encode(self::memoFromView(self::adminView($memo)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        Db::update('warranties', ['memo_snapshot' => $json], 'id = ?', [$id]);
    }

    // ------------------------------------------------------------------ lists

    public static function adminList(array $f): array
    {
        $now = Db::now();
        $soon = gmdate('Y-m-d H:i:s', time() + 7 * 86400);
        $where = ['1 = 1'];
        $params = [];
        $order = 'w.created_at DESC, w.id DESC';
        switch (Util::line($f['view'] ?? '', 20)) {
            case 'active':
                $where[] = "w.status = 'active' AND w.duration_days > 0 AND w.expires_at > ?";
                $params[] = $now;
                $order = 'w.expires_at ASC';
                break;
            case 'expiring':
                $where[] = "w.status = 'active' AND w.duration_days > 0 AND w.expires_at > ? AND w.expires_at <= ?";
                array_push($params, $now, $soon);
                $order = 'w.expires_at ASC';
                break;
            case 'expired':
                $where[] = "w.status = 'active' AND w.duration_days > 0 AND w.expires_at <= ?";
                $params[] = $now;
                $order = 'w.expires_at DESC';
                break;
            case 'void':
                $where[] = "w.status = 'void'";
                break;
        }
        $q = Util::line($f['q'] ?? '', 80);
        if ($q !== '') {
            $like = '%' . Util::likeEscape(mb_strtolower($q)) . '%';
            $or = [
                "LOWER(w.code) LIKE ? ESCAPE '!'",
                "LOWER(COALESCE(w.invoice_no, '')) LIKE ? ESCAPE '!'",
                "LOWER(w.customer_name) LIKE ? ESCAPE '!'",
                "EXISTS (SELECT 1 FROM warranty_items i WHERE i.warranty_id = w.id AND (LOWER(i.product_name) LIKE ? ESCAPE '!' OR LOWER(i.product_ref) LIKE ? ESCAPE '!' OR LOWER(COALESCE(i.serials, '')) LIKE ? ESCAPE '!'))",
            ];
            array_push($params, $like, $like, $like, $like, $like, $like);
            $phone = self::phoneKey($q);
            if (strlen($phone) >= 4 && preg_match('/^[\d\s+\-()]+$/', $q)) {
                $or[] = "w.phone_key LIKE ? ESCAPE '!'";
                $params[] = '%' . Util::likeEscape($phone) . '%';
            }
            $code = self::normalizeCode($q);
            if ($code) {
                $or[] = 'w.code = ?';
                $params[] = $code;
            }
            $where[] = '(' . implode(' OR ', $or) . ')';
        }
        $productId = Util::int($f['productId'] ?? null);
        if ($productId) {
            $where[] = 'EXISTS (SELECT 1 FROM warranty_items i WHERE i.warranty_id = w.id AND i.product_id = ?)';
            $params[] = $productId;
        }
        $limit = min(100, max(1, Util::int($f['limit'] ?? null, 30) ?? 30));
        $page = max(1, Util::int($f['page'] ?? null, 1) ?? 1);
        $offset = ($page - 1) * $limit;
        $whereSql = implode(' AND ', $where);

        $total = (int) Db::value("SELECT COUNT(*) FROM warranties w WHERE $whereSql", $params);
        $rows = Db::all("SELECT w.* FROM warranties w WHERE $whereSql ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        return [
            'items' => array_map([self::class, 'adminView'], $rows),
            'total' => $total,
            'page' => $page,
            'pages' => (int) ceil($total / $limit),
            'counts' => self::counts(),
        ];
    }

    public static function counts(): array
    {
        $now = Db::now();
        $soon = gmdate('Y-m-d H:i:s', time() + 7 * 86400);
        $row = Db::one(
            "SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' AND duration_days > 0 AND expires_at > ? THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'active' AND duration_days > 0 AND expires_at > ? AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring,
                SUM(CASE WHEN status = 'active' AND duration_days > 0 AND expires_at <= ? THEN 1 ELSE 0 END) AS expired,
                SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void
             FROM warranties",
            [$now, $now, $soon, $now]
        ) ?? [];
        return array_map(static fn ($v) => (int) $v, $row);
    }

    // ------------------------------------------------------------------ saving

    /** "45,000" -> 45000.0, "" -> null, junk -> NAN */
    private static function money(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        $t = str_replace([',', ' ', '৳'], '', Util::line($v, 30));
        return preg_match('/^\d+(\.\d{1,2})?$/', $t) ? (float) $t : NAN;
    }

    /** Creates or edits a memo from admin input. Editing keeps the code and memo number. */
    public static function save(?int $id, array $in): array
    {
        $existing = $id !== null ? self::find($id) : null;
        $errors = [];

        $name = Util::line($in['customerName'] ?? '', 80);
        if (mb_strlen($name) < 2) {
            $errors['customerName'] = "Write the customer's name.";
        }
        $phone = Util::line($in['customerPhone'] ?? '', 30);
        $phoneKey = self::phoneKey($phone);
        if (strlen($phoneKey) < 7 || strlen($phoneKey) > 15) {
            $errors['customerPhone'] = 'Write the phone number given for the memo, like 01712345678.';
        }
        $payment = Util::line($in['paymentMethod'] ?? '', 20);
        if (!isset(self::PAYMENT_METHODS[$payment])) {
            $errors['paymentMethod'] = 'Choose how the customer paid.';
        }
        $start = Util::parseDate($in['startsAt'] ?? null)
            ?? ($existing ? new DateTimeImmutable($existing['starts_at'], new DateTimeZone('UTC')) : (new DateTimeImmutable('today', new DateTimeZone('Asia/Dhaka')))->setTimezone(new DateTimeZone('UTC')));

        // Products
        $rawItems = is_array($in['items'] ?? null) ? array_values($in['items']) : [];
        if (!$rawItems) {
            $errors['items'] = 'Add at least one product.';
        } elseif (count($rawItems) > self::MAX_ITEMS) {
            $errors['items'] = 'Use ' . self::MAX_ITEMS . ' products or fewer on one memo.';
        }
        $oldItems = [];
        if ($existing) {
            foreach (self::itemsFor((int) $existing['id']) as $it) {
                $oldItems[(int) $it['id']] = $it;
            }
        }
        $items = [];
        $subtotal = 0.0;
        foreach (array_slice($rawItems, 0, self::MAX_ITEMS) as $i => $raw) {
            $raw = is_array($raw) ? $raw : [];
            $key = "items.$i.";
            $itemId = Util::int($raw['id'] ?? null);
            $old = $itemId && isset($oldItems[$itemId]) ? $oldItems[$itemId] : null;

            $productId = Util::int($raw['productId'] ?? null) ?: null;
            $product = $productId ? Db::one('SELECT id, name, sku FROM products WHERE id = ?', [$productId]) : null;
            if ($productId && !$product) {
                $errors[$key . 'productName'] = 'That product no longer exists.';
            }
            $productName = Util::line($raw['productName'] ?? '', 160) ?: ($product['name'] ?? '');
            if (mb_strlen($productName) < 2) {
                $errors[$key . 'productName'] = 'Write the product name.';
            }
            $qty = Util::int($raw['quantity'] ?? 1) ?? 0;
            if ($qty < 1 || $qty > self::MAX_QTY) {
                $errors[$key . 'quantity'] = 'Use 1 to ' . self::MAX_QTY . '.';
                $qty = max(1, min(self::MAX_QTY, $qty));
            }
            $serialsIn = $raw['serials'] ?? [];
            $serials = array_values(array_filter(
                array_map(static fn ($s) => Util::line($s, 80), is_array($serialsIn) ? $serialsIn : explode("\n", (string) $serialsIn)),
                static fn ($s) => $s !== ''
            ));
            if (count($serials) > $qty) {
                $errors[$key . 'serials'] = 'There are more serial numbers than units.';
            }
            $price = self::money($raw['unitPrice'] ?? null);
            if ($price === null || is_nan($price) || $price < 0 || $price > 100_000_000) {
                $errors[$key . 'unitPrice'] = 'Enter the price for one unit in taka.';
                $price = 0.0;
            }
            $subtotal += $price * $qty;

            $value = Util::int($raw['warrantyValue'] ?? null);
            $unit = Util::line($raw['warrantyUnit'] ?? 'day', 5);
            if (!isset(self::UNITS[$unit])) {
                $unit = 'day';
            }
            if ($value !== null && ($value < 0 || ($unit === 'day' && $value > 3650) || ($unit === 'month' && $value > 120) || ($unit === 'year' && $value > 10))) {
                $errors[$key . 'warrantyValue'] = 'That warranty is too long.';
            }
            $value = $value ?: null;

            // Keep an extended end date when nothing about the period changed.
            $expires = null;
            if ($value) {
                $same = $old && $old['warranty_value'] !== null && (int) $old['warranty_value'] === $value && $old['warranty_unit'] === $unit
                    && $old['starts_at'] === Util::dbDate($start) && $old['expires_at'] !== null;
                $expires = $same ? $old['expires_at'] : Util::dbDate(self::addPeriod($start, $value, $unit));
            }
            $items[] = [
                'old' => $old,
                'data' => [
                    'position' => $i,
                    'product_id' => $product ? (int) $product['id'] : null,
                    'product_name' => $productName,
                    'product_ref' => Util::line($raw['productRef'] ?? '', 80) ?: (string) ($product['sku'] ?? ''),
                    'quantity' => $qty,
                    'serials' => implode("\n", $serials),
                    'unit_price' => round($price, 2),
                    'warranty_value' => $value,
                    'warranty_unit' => $unit,
                    'warranty_note' => Util::line($raw['warrantyNote'] ?? '', 160),
                    'warranty_type' => isset(self::TYPES[$raw['warrantyType'] ?? '']) ? $raw['warrantyType'] : 'warranty',
                    'starts_at' => Util::dbDate($start),
                    'expires_at' => $expires,
                    'updated_at' => Db::now(),
                ],
            ];
        }

        $discount = self::money($in['discount'] ?? null) ?? 0.0;
        if (is_nan($discount) || $discount < 0) {
            $errors['discount'] = 'Enter the discount in taka, or leave it empty.';
        } elseif ($discount > $subtotal && !isset($errors['items'])) {
            $errors['discount'] = 'The discount is more than the subtotal.';
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $header = [
            'customer_name' => $name,
            'customer_phone' => $phone,
            'phone_key' => $phoneKey,
            'payment_method' => $payment,
            'discount' => round($discount, 2),
            'starts_at' => Util::dbDate($start),
            // The terms are saved with the memo, so later changes to the default terms do not change old memos.
            'terms' => ($t = Util::str($in['terms'] ?? '', 4000)) !== '' ? $t : ($existing['terms'] ?? (string) Settings::get('warrantyTerms')),
            'internal_notes' => Util::str($in['internalNotes'] ?? '', 2000),
            'updated_at' => Db::now(),
        ];

        $id = Db::transaction(static function () use ($existing, $header, $items, $oldItems) {
            if ($existing) {
                $id = (int) $existing['id'];
                Db::update('warranties', $header, 'id = ?', [$id]);
            } else {
                $header += [
                    'code' => self::newCode(),
                    'invoice_no' => self::newInvoiceNo(),
                    'status' => 'active',
                    'product_name' => $items[0]['data']['product_name'],
                    'product_ref' => '',
                    'expires_at' => $header['starts_at'],
                    'duration_days' => 0,
                    'created_at' => Db::now(),
                ];
                $id = Db::insert('warranties', $header);
            }
            $kept = [];
            foreach ($items as $item) {
                if ($item['old']) {
                    $kept[] = (int) $item['old']['id'];
                    Db::update('warranty_items', $item['data'], 'id = ? AND warranty_id = ?', [(int) $item['old']['id'], $id]);
                } else {
                    Db::insert('warranty_items', $item['data'] + ['warranty_id' => $id, 'status' => 'active', 'created_at' => Db::now()]);
                }
            }
            foreach (array_keys($oldItems) as $oldId) {
                if (!in_array($oldId, $kept, true)) {
                    Db::run('DELETE FROM warranty_items WHERE id = ? AND warranty_id = ?', [$oldId, $id]);
                }
            }
            self::sync($id);
            return $id;
        });
        self::saveSnapshot($id);
        return self::adminView(self::find($id));
    }

    /**
     * Keeps the memo's summary columns up to date (used by lists and counts):
     * product summary, latest end date of the products that are not void.
     */
    private static function sync(int $id): void
    {
        $memo = self::find($id);
        $items = Db::all('SELECT * FROM warranty_items WHERE warranty_id = ? ORDER BY position ASC, id ASC', [$id]);
        $latest = null;
        foreach ($items as $it) {
            if ($it['status'] !== 'void' && $it['expires_at'] !== null && ($latest === null || $it['expires_at'] > $latest)) {
                $latest = $it['expires_at'];
            }
        }
        $first = $items[0] ?? null;
        $extra = count($items) - 1;
        $start = self::ts($memo['starts_at']);
        Db::update('warranties', [
            'product_id' => $first && $first['product_id'] !== null ? (int) $first['product_id'] : null,
            'product_name' => mb_substr(($first['product_name'] ?? 'Memo') . ($extra > 0 ? " + $extra more" : ''), 0, 160),
            'expires_at' => $latest ?? $memo['starts_at'],
            'duration_days' => $latest ? max(1, (int) round((self::ts($latest) - $start) / 86400)) : 0,
        ], 'id = ?', [$id]);
    }

    private static function findItem(int $memoId, ?int $itemId): ?array
    {
        if (!$itemId) {
            return null;
        }
        $item = Db::one('SELECT * FROM warranty_items WHERE id = ? AND warranty_id = ?', [$itemId, $memoId]);
        if (!$item) {
            throw new HttpError(404, 'That product is not on this memo.');
        }
        return $item;
    }

    /** Adds time to one product, or to every product on the memo that has a warranty. */
    public static function extend(int $id, array $in): array
    {
        self::find($id);
        $days = Util::int($in['days'] ?? null, 0) ?? 0;
        $months = Util::int($in['months'] ?? null, 0) ?? 0;
        if (($days <= 0 && $months <= 0) || $days > 3650 || $months > 120) {
            throw HttpError::validation(['days' => 'Enter how many days or months to add.']);
        }
        $item = self::findItem($id, Util::int($in['itemId'] ?? null));
        $targets = $item ? [$item] : Db::all("SELECT * FROM warranty_items WHERE warranty_id = ? AND status <> 'void' AND expires_at IS NOT NULL", [$id]);
        if (!$targets || ($item && $item['expires_at'] === null)) {
            throw HttpError::validation(['days' => 'This product has no warranty to extend. Edit the memo to give it one.']);
        }
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        foreach ($targets as $t) {
            // Extend from the current end date, or from now if it already ended.
            $base = new DateTimeImmutable($t['expires_at'], new DateTimeZone('UTC'));
            if ($base < $now) {
                $base = $now;
            }
            $new = $months > 0 ? self::addPeriod($base, $months, 'month') : $base->modify("+$days days");
            Db::update('warranty_items', ['expires_at' => Util::dbDate($new), 'updated_at' => Db::now()], 'id = ?', [(int) $t['id']]);
        }
        Db::update('warranties', ['updated_at' => Db::now()], 'id = ?', [$id]);
        self::sync($id);
        return self::adminView(self::find($id));
    }

    /** Voids or restores one product, or the whole memo. */
    public static function setVoid(int $id, bool $void, string $reason = '', ?int $itemId = null): array
    {
        self::find($id);
        $data = [
            'status' => $void ? 'void' : 'active',
            'void_reason' => $void ? Util::line($reason, 300) : '',
            'voided_at' => $void ? Db::now() : null,
            'updated_at' => Db::now(),
        ];
        $item = self::findItem($id, $itemId);
        if ($item) {
            Db::update('warranty_items', $data, 'id = ?', [(int) $item['id']]);
            Db::update('warranties', ['updated_at' => Db::now()], 'id = ?', [$id]);
        } else {
            Db::update('warranties', $data, 'id = ?', [$id]);
        }
        self::sync($id);
        return self::adminView(self::find($id));
    }

    public static function delete(int $id, string $confirmCode): array
    {
        $row = self::find($id);
        if (self::normalizeCode($confirmCode) !== $row['code']) {
            throw HttpError::validation(['confirmCode' => 'Type the warranty code exactly to confirm.'], 'Type the warranty code to confirm deleting it.');
        }
        Db::transaction(static function () use ($id) {
            Db::run('DELETE FROM warranty_items WHERE warranty_id = ?', [$id]);
            Db::run('DELETE FROM warranties WHERE id = ?', [$id]);
        });
        return $row;
    }
}
