<?php
declare(strict_types=1);
defined('HB_API') || exit;

// One shared PDO connection. MySQL in production (cPanel), SQLite is
// available for quick local testing. Always use ? placeholders.
final class Db
{
    private static ?PDO $pdo = null;

    public static function driver(): string
    {
        return Env::get('DB_DRIVER', 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    }

    public static function isConfigured(): bool
    {
        return self::driver() === 'sqlite' || Env::get('DB_NAME') !== null;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if (self::driver() === 'sqlite') {
            $path = Env::get('DB_PATH', 'storage/hyperbyte.sqlite');
            if (!preg_match('#^([A-Za-z]:[\\\\/]|/)#', $path)) {
                $path = HB_API_DIR . '/' . $path; // relative paths start in the api folder
            }
            $dir = dirname($path);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
            $pdo = new PDO('sqlite:' . $path, null, null, $options);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        } else {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Env::get('DB_HOST', 'localhost'),
                Env::int('DB_PORT', 3306),
                Env::get('DB_NAME', '')
            );
            $pdo = new PDO($dsn, Env::get('DB_USER', 'root'), Env::get('DB_PASS', '') ?? '', $options);
            $pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo = $pdo;
    }

    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute(array_values($params));
        return $stmt;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /** Inserts a row and returns the new id. */
    public static function insert(string $table, array $data): int
    {
        $columns = array_keys($data);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $columns),
            implode(', ', array_fill(0, count($columns), '?'))
        );
        self::run($sql, array_values($data));
        return (int) self::pdo()->lastInsertId();
    }

    /** Updates rows matching $where (e.g. "id = ?") and returns the affected count. */
    public static function update(string $table, array $data, string $where, array $params): int
    {
        if (!$data) {
            return 0;
        }
        $sets = implode(', ', array_map(static fn ($column) => "$column = ?", array_keys($data)));
        return self::run("UPDATE $table SET $sets WHERE $where", [...array_values($data), ...$params])->rowCount();
    }

    public static function transaction(callable $callback): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }

    public static function isDuplicate(Throwable $e): bool
    {
        return $e instanceof PDOException
            && (($e->errorInfo[1] ?? null) === 1062 || str_contains($e->getMessage(), 'UNIQUE constraint failed'));
    }

    public static function tableExists(string $table): bool
    {
        try {
            if (self::driver() === 'sqlite') {
                return (bool) self::value("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [$table]);
            }
            return (bool) self::value('SHOW TABLES LIKE ?', [$table]);
        } catch (Throwable) {
            return false;
        }
    }
}
