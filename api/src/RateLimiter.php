<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Counts attempts per "bucket" (for example login attempts from one IP)
// inside a time window. Stored in the database so it works on shared hosting.
final class RateLimiter
{
    /** Records one attempt. Throws 429 when the bucket is over its limit. */
    public static function hit(string $bucket, int $max, int $windowSeconds, string $message): void
    {
        if (Env::bool('RATE_LIMIT_DISABLED')) {
            return;
        }
        $key = substr($bucket, 0, 190);
        $now = time();

        if (random_int(1, 50) === 1) {
            Db::run('DELETE FROM rate_limits WHERE reset_at < ?', [$now - 3600]);
        }

        $row = Db::one('SELECT hits, reset_at FROM rate_limits WHERE bucket = ?', [$key]);
        if (!$row || (int) $row['reset_at'] <= $now) {
            try {
                if ($row) {
                    Db::run('UPDATE rate_limits SET hits = 1, reset_at = ? WHERE bucket = ?', [$now + $windowSeconds, $key]);
                } else {
                    Db::insert('rate_limits', ['bucket' => $key, 'hits' => 1, 'reset_at' => $now + $windowSeconds]);
                }
            } catch (Throwable $e) {
                if (!Db::isDuplicate($e)) {
                    throw $e;
                }
                Db::run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$key]);
            }
            return;
        }
        if ((int) $row['hits'] >= $max) {
            $wait = max(1, (int) $row['reset_at'] - $now);
            $minutes = (int) ceil($wait / 60);
            throw new HttpError(429, $message . " Try again in $minutes minute" . ($minutes === 1 ? '' : 's') . '.', ['retryAfter' => $wait]);
        }
        Db::run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$key]);
    }

    public static function clear(string $bucket): void
    {
        Db::run('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 190)]);
    }
}
