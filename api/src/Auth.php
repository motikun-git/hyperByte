<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Admin login with a PHP session cookie (HttpOnly, SameSite=Strict) and a
// CSRF token that must be sent in the X-CSRF-Token header for every change.
final class Auth
{
    private const IDLE_LIMIT = 4 * 3600;       // log out after 4 hours without activity
    private const ABSOLUTE_LIMIT = 24 * 3600;  // and always after 24 hours

    private static ?array $admin = null;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $dir = HB_API_DIR . '/storage/sessions';
        if (is_dir($dir) || @mkdir($dir, 0700, true)) {
            session_save_path($dir);
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) self::ABSOLUTE_LIMIT);
        session_name(Util::isHttps() ? '__Host-hb_admin' : 'hb_admin');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => Util::isHttps(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    /** The logged-in admin, or null. */
    public static function admin(): ?array
    {
        if (self::$admin !== null) {
            return self::$admin;
        }
        self::startSession();
        $id = $_SESSION['admin_id'] ?? null;
        if (!$id) {
            return null;
        }
        $now = time();
        $tooOld = ($now - (int) ($_SESSION['login_at'] ?? 0)) > self::ABSOLUTE_LIMIT;
        $idle = ($now - (int) ($_SESSION['seen_at'] ?? 0)) > self::IDLE_LIMIT;
        if ($tooOld || $idle) {
            self::logout();
            return null;
        }
        $admin = Db::one('SELECT id, name, email, is_active, last_login_at FROM admins WHERE id = ?', [$id]);
        if (!$admin || !(int) $admin['is_active']) {
            self::logout();
            return null;
        }
        $_SESSION['seen_at'] = $now;
        return self::$admin = $admin;
    }

    /** Stops the request unless an admin is logged in (and, for changes, sent the CSRF token). */
    public static function requireAdmin(Request $req): array
    {
        $admin = self::admin();
        if (!$admin) {
            throw new HttpError(401, 'Please log in to the admin panel.');
        }
        if (!in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            $sent = $req->header('X-CSRF-Token');
            if ($sent === '' || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $sent)) {
                throw new HttpError(403, 'Your session token is missing or out of date. Reload the page and try again.');
            }
        }
        return $admin;
    }

    public static function login(array $admin): void
    {
        self::startSession();
        session_regenerate_id(true);
        $_SESSION = [
            'admin_id' => (int) $admin['id'],
            'csrf' => bin2hex(random_bytes(32)),
            'login_at' => time(),
            'seen_at' => time(),
        ];
        Db::update('admins', ['last_login_at' => Db::now()], 'id = ?', [$admin['id']]);
        self::$admin = null;
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 3600,
                'path' => $p['path'],
                'secure' => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => $p['samesite'] ?: 'Strict',
            ]);
        }
        session_destroy();
        self::$admin = null;
    }

    public static function csrf(): string
    {
        self::startSession();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
    }

    /** At least 10 characters, with letters and numbers. Returns an error message or null. */
    public static function passwordProblem(string $password): ?string
    {
        if (strlen($password) < 10) {
            return 'Use at least 10 characters.';
        }
        if (strlen($password) > 200) {
            return 'That password is too long.';
        }
        if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
            return 'Use both letters and numbers.';
        }
        return null;
    }
}
