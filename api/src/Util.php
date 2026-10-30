<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Small helpers for turning request input into safe, typed values.
final class Util
{
    public const CONDITIONS = [
        'like_new' => 'Like new',
        'excellent' => 'Excellent',
        'good' => 'Good',
        'fair' => 'Fair',
        'for_parts' => 'For parts',
    ];

    public const STATUSES = [
        'available' => 'Available now',
        'preorder' => 'Pre-order',
        'sold' => 'Sold out',
        'unavailable' => 'Unavailable',
    ];

    /** Steps of a pre-order / sourcing request in the admin tracker. */
    public const INQUIRY_STATUSES = [
        'inquiry' => 'Inquiry',
        'sourcing' => 'Sourcing',
        'expected' => 'Expected',
        'available' => 'Available',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
    ];

    public const CATEGORY_ICONS = ['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'psu', 'laptop', 'case', 'fan', 'monitor', 'keyboard', 'mouse', 'other'];

    /** Text: trims, removes control characters, cuts to $max characters. Arrays become "". */
    public static function str(mixed $value, int $max = 255): string
    {
        if ($value === null || is_array($value) || is_object($value)) {
            return '';
        }
        $text = (string) $value;
        if (!mb_check_encoding($text, 'UTF-8')) {
            $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        }
        // Keep new lines and tabs, drop other invisible control characters.
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
        $text = str_replace("\r\n", "\n", trim($text));
        return mb_substr($text, 0, $max);
    }

    /** One line of text (new lines become spaces). */
    public static function line(mixed $value, int $max = 255): string
    {
        $text = preg_replace('/\s+/u', ' ', self::str($value, $max * 2)) ?? '';
        return mb_substr(trim($text), 0, $max);
    }

    public static function int(mixed $value, ?int $default = null): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value) && is_finite($value)) {
            return (int) round($value);
        }
        if (is_string($value)) {
            $clean = str_replace([',', ' ', '৳'], '', trim($value));
            if ($clean !== '' && preg_match('/^-?\d+(\.\d+)?$/', $clean)) {
                return (int) round((float) $clean);
            }
        }
        return $default;
    }

    public static function bool(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        return in_array(is_scalar($value) ? strtolower((string) $value) : '', ['1', 'true', 'yes', 'on'], true);
    }

    public static function slugify(string $text, int $max = 80): string
    {
        $text = mb_strtolower($text);
        if (function_exists('transliterator_transliterate')) {
            $converted = transliterator_transliterate('Any-Latin; Latin-ASCII', $text);
            if (is_string($converted)) {
                $text = $converted;
            }
        }
        $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
        return substr(trim($text, '-'), 0, $max);
    }

    public static function isEmail(string $value): bool
    {
        return (bool) filter_var($value, FILTER_VALIDATE_EMAIL);
    }

    /** Only http(s) links are accepted. Adds https:// when missing. Returns "" for invalid input. */
    public static function url(mixed $value, int $max = 300): string
    {
        $url = self::line($value, $max);
        if ($url === '') {
            return '';
        }
        if (!preg_match('#^https?://#i', $url)) {
            $url = 'https://' . ltrim($url, '/');
        }
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return '';
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https'], true) ? $url : '';
    }

    /**
     * WhatsApp needs the number with country code and digits only, e.g. 8801712345678.
     * Bangladeshi numbers typed as 01712345678 get 880 added. Returns "" if invalid.
     */
    public static function whatsappNumber(mixed $value): string
    {
        $digits = preg_replace('/\D/', '', self::line($value, 30)) ?? '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (preg_match('/^01[3-9]\d{8}$/', $digits)) {
            $digits = '88' . $digits;
        }
        return preg_match('/^[1-9]\d{7,14}$/', $digits) ? $digits : '';
    }

    public static function randomCode(int $length, string $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string
    {
        $out = '';
        $max = strlen($alphabet) - 1;
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, $max)];
        }
        return $out;
    }

    /** "2026-10-27 10:00:00" (UTC in the database) -> "2026-10-27T10:00:00Z" */
    public static function iso(?string $dbDate): ?string
    {
        if ($dbDate === null || $dbDate === '') {
            return null;
        }
        return str_replace(' ', 'T', substr($dbDate, 0, 19)) . 'Z';
    }

    /** Accepts "2026-10-27", "2026-10-27T15:30", or a full ISO string. Dates without a zone are Dhaka time. */
    public static function parseDate(mixed $value): ?DateTimeImmutable
    {
        $text = self::line($value, 40);
        if ($text === '') {
            return null;
        }
        try {
            $hasZone = (bool) preg_match('/(Z|[+-]\d{2}:?\d{2})$/', $text);
            $date = $hasZone
                ? new DateTimeImmutable($text)
                : new DateTimeImmutable($text, new DateTimeZone('Asia/Dhaka'));
            return $date->setTimezone(new DateTimeZone('UTC'));
        } catch (Exception) {
            return null;
        }
    }

    public static function dbDate(DateTimeInterface $date): string
    {
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** "2026-10-27" for DATE columns, or null when empty or not a real date. */
    public static function dateOnly(mixed $value): ?string
    {
        $text = self::line($value, 20);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $text, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }
        return $text;
    }

    /** Escapes % and _ for a LIKE pattern (used with ESCAPE '!'). */
    public static function likeEscape(string $text): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $text);
    }

    public static function clientIp(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        if (Env::bool('TRUST_PROXY') && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $first = trim(explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                $ip = $first;
            }
        }
        return substr($ip, 0, 45);
    }

    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        if (Env::bool('TRUST_PROXY') && strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') {
            return true;
        }
        return str_starts_with((string) Env::get('APP_URL', ''), 'https://');
    }
}
