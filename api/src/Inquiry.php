<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Pre-order and sourcing requests, entered by the admin by hand (for example
// after a WhatsApp or Facebook chat). An inquiry is not a confirmed order,
// and customer details are only ever shown in the admin panel.
final class Inquiry
{
    private const SELECT = 'SELECT i.*, p.sku AS product_sku, p.slug AS product_slug FROM inquiries i LEFT JOIN products p ON p.id = i.product_id';

    public static function shape(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'ref' => $row['ref'],
            'productId' => $row['product_id'] === null ? null : (int) $row['product_id'],
            'productName' => $row['product_name'],
            'productSku' => $row['product_sku'] ?? null,
            'productSlug' => $row['product_slug'] ?? null,
            'customerName' => $row['customer_name'],
            'customerContact' => $row['customer_contact'],
            'inquiryDate' => $row['inquiry_date'] ? substr((string) $row['inquiry_date'], 0, 10) : null,
            'expectedPrice' => $row['expected_price'] === null ? null : (int) $row['expected_price'],
            'eta' => $row['eta'] ? substr((string) $row['eta'], 0, 10) : null,
            'status' => $row['status'],
            'notes' => (string) ($row['notes'] ?? ''),
            'createdAt' => Util::iso($row['created_at']),
            'updatedAt' => Util::iso($row['updated_at']),
        ];
    }

    public static function find(int $id): array
    {
        $row = Db::one(self::SELECT . ' WHERE i.id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Inquiry not found.');
        }
        return $row;
    }

    public static function counts(): array
    {
        $out = array_fill_keys(array_keys(Util::INQUIRY_STATUSES), 0);
        foreach (Db::all('SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status') as $row) {
            if (isset($out[$row['status']])) {
                $out[$row['status']] = (int) $row['n'];
            }
        }
        $out['open'] = $out['inquiry'] + $out['sourcing'] + $out['expected'] + $out['available'];
        $out['total'] = array_sum(array_intersect_key($out, Util::INQUIRY_STATUSES));
        return $out;
    }

    /** Filters: status ("open" = not completed or cancelled), q, productId, page. */
    public static function list(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        $status = Util::line($f['status'] ?? '', 20);
        if ($status === 'open') {
            $where[] = "i.status IN ('inquiry','sourcing','expected','available')";
        } elseif (isset(Util::INQUIRY_STATUSES[$status])) {
            $where[] = 'i.status = ?';
            $params[] = $status;
        }
        $q = mb_strtolower(Util::line($f['q'] ?? '', 80));
        if ($q !== '') {
            $like = '%' . Util::likeEscape($q) . '%';
            $where[] = "(LOWER(i.ref) LIKE ? ESCAPE '!' OR LOWER(i.product_name) LIKE ? ESCAPE '!' OR LOWER(i.customer_name) LIKE ? ESCAPE '!' OR LOWER(i.customer_contact) LIKE ? ESCAPE '!')";
            array_push($params, $like, $like, $like, $like);
        }
        $productId = Util::int($f['productId'] ?? null);
        if ($productId) {
            $where[] = 'i.product_id = ?';
            $params[] = $productId;
        }
        $limit = min(100, max(1, Util::int($f['limit'] ?? null, 30) ?? 30));
        $page = max(1, Util::int($f['page'] ?? null, 1) ?? 1);
        $offset = ($page - 1) * $limit;
        $whereSql = implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) FROM inquiries i WHERE $whereSql", $params);
        $rows = Db::all(self::SELECT . " WHERE $whereSql ORDER BY i.inquiry_date DESC, i.id DESC LIMIT $limit OFFSET $offset", $params);
        return [
            'items' => array_map([self::class, 'shape'], $rows),
            'total' => $total,
            'page' => $page,
            'pages' => (int) ceil($total / $limit),
            'counts' => self::counts(),
        ];
    }

    public static function save(?int $id, array $in): array
    {
        if ($id !== null) {
            self::find($id);
        }
        $errors = [];
        $productId = Util::int($in['productId'] ?? null) ?: null;
        $product = $productId ? Db::one('SELECT id, name FROM products WHERE id = ?', [$productId]) : null;
        if ($productId && !$product) {
            $errors['productId'] = 'That product no longer exists.';
        }
        $productName = Util::line($in['productName'] ?? '', 160) ?: ($product['name'] ?? '');
        if (mb_strlen($productName) < 2) {
            $errors['productName'] = 'Choose a product or type what the customer wants.';
        }
        $status = Util::line($in['status'] ?? 'inquiry', 20);
        if (!isset(Util::INQUIRY_STATUSES[$status])) {
            $errors['status'] = 'Choose a status.';
        }
        $date = Util::dateOnly($in['inquiryDate'] ?? '') ?? (new DateTimeImmutable('now', new DateTimeZone('Asia/Dhaka')))->format('Y-m-d');
        $etaRaw = Util::line($in['eta'] ?? '', 20);
        $eta = Util::dateOnly($etaRaw);
        if ($etaRaw !== '' && $eta === null) {
            $errors['eta'] = 'Use a real date, or leave it empty.';
        }
        $priceRaw = $in['expectedPrice'] ?? null;
        $price = ($priceRaw === null || $priceRaw === '') ? null : Util::int($priceRaw);
        if ($priceRaw !== null && $priceRaw !== '' && ($price === null || $price < 0 || $price > 50_000_000)) {
            $errors['expectedPrice'] = 'Enter an amount in taka, or leave it empty.';
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }
        $data = [
            'product_id' => $product ? (int) $product['id'] : null,
            'product_name' => $productName,
            'customer_name' => Util::line($in['customerName'] ?? '', 80),
            'customer_contact' => Util::line($in['customerContact'] ?? '', 120),
            'inquiry_date' => $date,
            'expected_price' => $price,
            'eta' => $eta,
            'status' => $status,
            'notes' => Util::str($in['notes'] ?? '', 4000),
            'updated_at' => Db::now(),
        ];
        if ($id === null) {
            $data['ref'] = 'TMP-' . bin2hex(random_bytes(5));
            $data['created_at'] = Db::now();
            $id = Db::insert('inquiries', $data);
            Db::update('inquiries', ['ref' => 'HBQ-' . (1000 + $id)], 'id = ?', [$id]);
        } else {
            Db::update('inquiries', $data, 'id = ?', [$id]);
        }
        return self::shape(self::find($id));
    }

    public static function delete(int $id): array
    {
        $row = self::find($id);
        Db::run('DELETE FROM inquiries WHERE id = ?', [$id]);
        return $row;
    }
}
