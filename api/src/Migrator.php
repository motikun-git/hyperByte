<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Creates and upgrades the database tables. Each file in api/migrations
// runs once; applied versions are remembered in schema_migrations.
final class Migrator
{
    /** Runs every migration that has not run yet. Returns the versions applied now. */
    public static function migrate(): array
    {
        $driver = Db::driver();
        Db::run(
            $driver === 'sqlite'
                ? 'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
                : 'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(60) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $done = array_column(Db::all('SELECT version FROM schema_migrations'), 'version');
        $files = glob(HB_API_DIR . '/migrations/*.php') ?: [];
        sort($files);
        $applied = [];
        foreach ($files as $file) {
            $version = basename($file, '.php');
            if (in_array($version, $done, true)) {
                continue;
            }
            $migration = require $file;
            $statements = $migration[$driver] ?? [];
            foreach ($statements as $sql) {
                Db::run($sql);
            }
            if (isset($migration['after']) && is_callable($migration['after'])) {
                ($migration['after'])();
            }
            Db::insert('schema_migrations', ['version' => $version, 'applied_at' => Db::now()]);
            $applied[] = $version;
        }
        return $applied;
    }

    /**
     * Applies new migrations after an update, so the website keeps working
     * without a manual step. A small marker file makes this a no-op on
     * normal requests; a lock file stops two requests migrating at once.
     */
    public static function ensureCurrent(): void
    {
        $files = glob(HB_API_DIR . '/migrations/*.php') ?: [];
        if (!$files) {
            return;
        }
        sort($files);
        $latest = basename((string) end($files), '.php');
        $marker = HB_API_DIR . '/storage/schema-version';
        if (is_file($marker) && trim((string) @file_get_contents($marker)) === $latest) {
            return;
        }
        if (!self::isInstalled()) {
            return; // first-time setup creates everything
        }
        $lock = @fopen(HB_API_DIR . '/storage/migrate.lock', 'c');
        if ($lock) {
            flock($lock, LOCK_EX);
        }
        try {
            self::migrate();
            @file_put_contents($marker, $latest);
        } finally {
            if ($lock) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    public static function isInstalled(): bool
    {
        return Db::tableExists('admins') && Db::tableExists('products');
    }
}
