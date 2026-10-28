<?php
// Local server for development. From the HyperByte folder run:
//   php -S localhost:8000 dev-router.php
// It answers /api/... (the PHP API) and /uploads/... (photos).
// After "npm run build" it also shows the built website at http://localhost:8000.
declare(strict_types=1);

$root = __DIR__;
$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));

$types = [
    'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8',
    'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp',
    'ico' => 'image/x-icon', 'woff2' => 'font/woff2', 'json' => 'application/json', 'txt' => 'text/plain; charset=utf-8',
    'xml' => 'application/xml', 'map' => 'application/json',
];

$sendFile = static function (string $file) use ($types): void {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    readfile($file);
};

if ($path === '/api' || str_starts_with($path, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $root . '/api/index.php';
    require $root . '/api/index.php';
    return true;
}

if (str_starts_with($path, '/uploads/')) {
    require_once $root . '/api/src/bootstrap.php';
    $base = realpath(Images::uploadDir());
    $file = $base ? realpath($base . substr($path, strlen('/uploads'))) : false;
    $ext = $file ? strtolower(pathinfo($file, PATHINFO_EXTENSION)) : '';
    if ($file && str_starts_with($file, $base . DIRECTORY_SEPARATOR) && is_file($file) && in_array($ext, ['webp', 'jpg', 'jpeg', 'png'], true)) {
        header('Cache-Control: public, max-age=3600');
        $sendFile($file);
    } else {
        http_response_code(404);
        echo 'Not found';
    }
    return true;
}

// Preview of the built website (client/dist), the same way the hosting serves it.
$dist = getenv('HB_DIST') ?: $root . '/client/dist';
if (is_file($dist . '/index.html')) {
    $distReal = realpath($dist);
    $file = realpath($dist . $path);
    if ($path !== '/' && $file && str_starts_with($file, $distReal . DIRECTORY_SEPARATOR) && is_file($file) && basename($file) !== 'index.html') {
        $sendFile($file);
        return true;
    }
    define('HB_DIST_DIR', $distReal);
    define('HB_API_DIR', $root . '/api');
    require $root . '/site/index.php';
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "The HyperByte API is running.\nOpen the website at http://localhost:5173 (run \"npm run dev\" in the client folder).\n";
return true;
