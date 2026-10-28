<?php
// Loads configuration and the helper classes. Every entry point
// (api/index.php, the site's index.php and the CLI scripts) starts here.
declare(strict_types=1);

if (!defined('HB_API')) {
    define('HB_API', true);
}
if (!defined('HB_API_DIR')) {
    define('HB_API_DIR', dirname(__DIR__));
}

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('HyperByte needs PHP 8.1 or newer. Change the PHP version in your hosting control panel.');
}

require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Util.php';
require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/RateLimiter.php';
require_once __DIR__ . '/Settings.php';
require_once __DIR__ . '/Images.php';
require_once __DIR__ . '/ActivityLog.php';
require_once __DIR__ . '/Migrator.php';
require_once __DIR__ . '/Catalog.php';
require_once __DIR__ . '/Warranty.php';
require_once __DIR__ . '/Inquiry.php';
require_once __DIR__ . '/Ledger.php';

Env::load(HB_API_DIR . '/.env');

// All dates are stored and calculated in UTC; the website shows Dhaka time.
date_default_timezone_set('UTC');

if (Env::bool('APP_DEBUG', false)) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
}
ini_set('log_errors', '1');
$hbLogDir = HB_API_DIR . '/storage/logs';
if (is_dir($hbLogDir) || @mkdir($hbLogDir, 0755, true)) {
    ini_set('error_log', $hbLogDir . '/php-errors.log');
}
unset($hbLogDir);
