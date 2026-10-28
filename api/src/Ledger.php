<?php
declare(strict_types=1);
defined('HB_API') || exit;

// The private sales ledger, kept by month like a spreadsheet tab.
// - One month is open at a time. Entries can only be added or changed there.
// - "Close month" keeps sold entries in that month and moves the unsold ones
//   to the next month, which becomes the open one.
// - Profit is only counted for sold entries.
// - Each entry keeps the yuan rate it was saved with, so changing the rate
//   later never changes old numbers.
// Not connected to the products shown on the website.
final class Ledger
{
    public const DEFAULT_RATE = 19.40;
    private const RATE_KEY = 'ledgerRate';
    private const MAX_MONEY = 100_000_000;

    // ------------------------------------------------------------------ rate

    public static function rate(): float
    {
        $raw = Db::value('SELECT value FROM settings WHERE name = ?', [self::RATE_KEY]);
        $value = $raw === null ? null : json_decode((string) $raw, true);
        return is_numeric($value) && (float) $value > 0 ? round((float) $value, 4) : self::DEFAULT_RATE;
    }

    public static function setRate(mixed $input): float
    {
        $rate = self::number($input, true);
        if ($rate === null || is_nan($rate) || $rate <= 0 || $rate > 1000) {
            throw HttpError::validation(['rate' => 'Enter the taka value of 1 yuan, like 19.40.']);
        }
        Settings::set(self::RATE_KEY, round($rate, 4));
        return self::rate();
    }

    // ------------------------------------------------------------------ months

    private static function nowYm(): string
    {
        return (new DateTimeImmutable('now', new DateTimeZone('Asia/Dhaka')))->format('Y-m');
    }

    private static function nextYm(string $ym): string
    {
        return (new DateTimeImmutable($ym . '-01'))->modify('+1 month')->format('Y-m');
    }

    /** The open month; created (as the current month) the first time the ledger is used. */
    public static function openMonth(): array
    {
        $row = Db::one("SELECT * FROM ledger_months WHERE status = 'open' ORDER BY ym DESC LIMIT 1");
        if ($row) {
            return $row;
        }
        $latest = Db::one('SELECT ym FROM ledger_months ORDER BY ym DESC LIMIT 1');
        $ym = $latest ? self::nextYm($latest['ym']) : self::nowYm();
        try {
            Db::insert('ledger_months', ['ym' => $ym, 'status' => 'open', 'note' => '', 'created_at' => Db::now(), 'updated_at' => Db::now()]);
        } catch (Throwable $e) {
            if (!Db::isDuplicate($e)) {
                throw $e;
            }
        }
        return Db::one('SELECT * FROM ledger_months WHERE ym = ?', [$ym]);
    }

    private static function monthByYm(string $ym): array
    {
        $row = preg_match('/^\d{4}-\d{2}$/', $ym) ? Db::one('SELECT * FROM ledger_months WHERE ym = ?', [$ym]) : null;
        if (!$row) {
            throw new HttpError(404, 'That month is not in the ledger.');
        }
        return $row;
    }

    private static function monthShape(array $m): array
    {
        return [
            'ym' => $m['ym'],
            'status' => $m['status'],
            'note' => (string) ($m['note'] ?? ''),
            'closedAt' => Util::iso($m['closed_at'] ?? null),
        ];
    }

    /** Everything the ledger page needs for one month (the open month by default). */
    public static function view(?string $ym = null): array
    {
        $open = self::openMonth();
        $month = ($ym === null || $ym === '' || $ym === $open['ym']) ? $open : self::monthByYm($ym);
        $entries = array_map(
            [self::class, 'shape'],
            Db::all('SELECT * FROM ledger_entries WHERE month_id = ? ORDER BY id ASC', [(int) $month['id']])
        );
        return [
            'month' => self::monthShape($month),
            'openYm' => $open['ym'],
            'currentYm' => self::nowYm(),
            'months' => array_map(
                static fn ($m) => ['ym' => $m['ym'], 'status' => $m['status']],
                Db::all('SELECT ym, status FROM ledger_months ORDER BY ym DESC')
            ),
            'entries' => $entries,
            'summary' => self::summarize($entries),
            'rate' => self::rate(),
        ];
    }

    /** Totals for the dashboard: the open month only. */
    public static function openSummary(): array
    {
        $open = self::openMonth();
        $entries = array_map([self::class, 'shape'], Db::all('SELECT * FROM ledger_entries WHERE month_id = ?', [(int) $open['id']]));
        return ['ym' => $open['ym']] + self::summarize($entries);
    }

    public static function summarize(array $entries): array
    {
        $s = ['soldCount' => 0, 'turnover' => 0.0, 'soldCost' => 0.0, 'profit' => 0.0, 'unsoldCount' => 0, 'unsoldCost' => 0.0];
        foreach ($entries as $e) {
            if ($e['sold']) {
                $s['soldCount']++;
                $s['turnover'] += $e['selling'];
                $s['soldCost'] += $e['totalCost'];
                $s['profit'] += $e['profit'];
            } else {
                $s['unsoldCount']++;
                $s['unsoldCost'] += $e['totalCost'];
            }
        }
        foreach (['turnover', 'soldCost', 'profit', 'unsoldCost'] as $k) {
            $s[$k] = round($s[$k], 2);
        }
        return $s;
    }

    public static function saveNote(string $ym, mixed $note): array
    {
        $month = self::monthByYm($ym);
        Db::update('ledger_months', ['note' => Util::str($note, 4000), 'updated_at' => Db::now()], 'id = ?', [(int) $month['id']]);
        return self::monthShape(self::monthByYm($ym));
    }

    /**
     * Closes the open month: sold entries stay, unsold entries move to the next
     * month, which becomes the open month. $ym must be the open month (stops a
     * double click from closing two months).
     */
    public static function closeMonth(string $ym): array
    {
        return Db::transaction(static function () use ($ym) {
            $open = self::openMonth();
            if ($open['ym'] !== $ym) {
                throw new HttpError(409, 'This month is already closed. Refresh the page.');
            }
            $nextYm = self::nextYm($ym);
            $next = Db::one('SELECT * FROM ledger_months WHERE ym = ?', [$nextYm]);
            if ($next) {
                Db::update('ledger_months', ['status' => 'open', 'closed_at' => null, 'updated_at' => Db::now()], 'id = ?', [(int) $next['id']]);
                $nextId = (int) $next['id'];
            } else {
                $nextId = Db::insert('ledger_months', ['ym' => $nextYm, 'status' => 'open', 'note' => '', 'created_at' => Db::now(), 'updated_at' => Db::now()]);
            }
            $moved = Db::run(
                'UPDATE ledger_entries SET month_id = ?, updated_at = ? WHERE month_id = ? AND sold = 0',
                [$nextId, Db::now(), (int) $open['id']]
            )->rowCount();
            Db::update('ledger_months', ['status' => 'closed', 'closed_at' => Db::now(), 'updated_at' => Db::now()], 'id = ?', [(int) $open['id']]);
            return ['closed' => $ym, 'open' => $nextYm, 'moved' => $moved];
        });
    }

    // ------------------------------------------------------------------ entries

    public static function shape(array $row): array
    {
        $amount = (float) $row['cost_amount'];
        $currency = $row['cost_currency'] === 'BDT' ? 'BDT' : 'CNY';
        $rate = $row['rate'] === null ? null : (float) $row['rate'];
        $costBdt = $currency === 'CNY' ? round($amount * (float) $rate, 2) : $amount;
        $shipping = (float) $row['shipping'];
        $extra = (float) $row['extra'];
        $total = round($costBdt + $shipping + $extra, 2);
        $sold = (bool) (int) $row['sold'];
        $selling = $row['selling'] === null ? null : (float) $row['selling'];
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'firstYm' => $row['first_ym'],
            'costCurrency' => $currency,
            'costAmount' => $amount,
            'rate' => $currency === 'CNY' ? $rate : null,
            'costBdt' => $costBdt,
            'shipping' => $shipping,
            'extra' => $extra,
            'totalCost' => $total,
            'selling' => $selling,
            'sold' => $sold,
            // Only sold items have a profit; unsold items are not counted.
            'profit' => $sold && $selling !== null ? round($selling - $total, 2) : null,
            'note' => (string) $row['note'],
            'createdAt' => Util::iso($row['created_at']),
            'updatedAt' => Util::iso($row['updated_at']),
        ];
    }

    private static function findEditable(int $id): array
    {
        $row = Db::one('SELECT e.*, m.status AS month_status FROM ledger_entries e JOIN ledger_months m ON m.id = e.month_id WHERE e.id = ?', [$id]);
        if (!$row) {
            throw new HttpError(404, 'Entry not found.');
        }
        if ($row['month_status'] !== 'open') {
            throw new HttpError(409, 'This month is closed, so its entries cannot be changed.');
        }
        return $row;
    }

    /** Money or rate typed by hand: "1,50,000", "45000", "19.40". Returns null when empty. */
    private static function number(mixed $value, bool $isRate = false): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }
        $text = str_replace([' ', '৳', '¥'], '', Util::line($value, 30));
        if ($isRate && !str_contains($text, '.') && substr_count($text, ',') === 1) {
            $text = str_replace(',', '.', $text); // "19,40"
        }
        $text = str_replace(',', '', $text);
        return preg_match('/^\d+(\.\d{1,4})?$/', $text) ? (float) $text : NAN;
    }

    public static function save(?int $id, array $in): array
    {
        $existing = $id === null ? null : self::findEditable($id);
        $errors = [];

        $name = Util::line($in['name'] ?? '', 160);
        if (mb_strlen($name) < 2) {
            $errors['name'] = 'Write the product name.';
        }
        $currency = ($in['costCurrency'] ?? 'CNY') === 'BDT' ? 'BDT' : 'CNY';

        $money = static function (string $key, bool $required, string $message) use ($in, &$errors): ?float {
            $v = self::number($in[$key] ?? null);
            if ($v === null) {
                if ($required) {
                    $errors[$key] = $message;
                }
                return null;
            }
            if (is_nan($v) || $v < 0 || $v > self::MAX_MONEY) {
                $errors[$key] = 'Enter a number, like 45000 or 1,50,000.';
                return null;
            }
            return round($v, 2);
        };

        $amount = $money('costAmount', true, $currency === 'CNY' ? 'Enter the buy price in yuan.' : 'Enter the buy price in taka.');
        $rate = null;
        if ($currency === 'CNY') {
            $rateIn = $in['rate'] ?? null;
            $rate = ($rateIn === null || $rateIn === '') ? ($existing && $existing['rate'] !== null ? (float) $existing['rate'] : self::rate()) : self::number($rateIn, true);
            if ($rate === null || is_nan($rate) || $rate <= 0 || $rate > 1000) {
                $errors['rate'] = 'Enter the taka value of 1 yuan, like 19.40.';
            }
        }
        $shipping = $money('shipping', false, '') ?? 0.0;
        $extra = $money('extra', false, '') ?? 0.0;
        $selling = $money('selling', false, '');
        $sold = Util::bool($in['sold'] ?? false);
        if ($sold && $selling === null && !isset($errors['selling'])) {
            $errors['selling'] = 'Enter the selling price to mark it sold.';
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $data = [
            'name' => $name,
            'cost_currency' => $currency,
            'cost_amount' => $amount,
            'rate' => $currency === 'CNY' ? round((float) $rate, 4) : null,
            'shipping' => $shipping,
            'extra' => $extra,
            'selling' => $selling,
            'sold' => $sold ? 1 : 0,
            'note' => Util::line($in['note'] ?? '', 500),
            'updated_at' => Db::now(),
        ];
        if ($existing === null) {
            $open = self::openMonth();
            $data['month_id'] = (int) $open['id'];
            $data['first_ym'] = $open['ym'];
            $data['created_at'] = Db::now();
            $id = Db::insert('ledger_entries', $data);
        } else {
            Db::update('ledger_entries', $data, 'id = ?', [$id]);
        }
        return self::shape(Db::one('SELECT * FROM ledger_entries WHERE id = ?', [$id]));
    }

    public static function delete(int $id): array
    {
        $row = self::findEditable($id);
        Db::run('DELETE FROM ledger_entries WHERE id = ?', [$id]);
        return $row;
    }
}
