<?php
// Serves the website (the built React app in index.html) with the right
// title, description and social preview for each page, so Facebook and
// Google see real product information. Also makes /sitemap.xml and /robots.txt.
declare(strict_types=1);

if (!defined('HB_DIST_DIR')) {
    define('HB_DIST_DIR', __DIR__);
}
if (!defined('HB_API_DIR')) {
    define('HB_API_DIR', __DIR__ . '/api');
}
require HB_API_DIR . '/src/bootstrap.php';

$path = '/' . trim(rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)), '/');
$host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
$origin = rtrim((string) (Env::get('APP_URL') ?: ((Util::isHttps() ? 'https' : 'http') . '://' . $host)), '/');
try {
    Migrator::ensureCurrent();
} catch (Throwable) {
    // Database not ready yet: pages still load, the API reports the problem.
}
$settings = Settings::all();
$site = (string) $settings['siteName'];

function hb_e(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function hb_taka(?int $amount): string
{
    if ($amount === null) {
        return 'Contact for price';
    }
    $digits = (string) $amount;
    if (strlen($digits) > 3) {
        $last3 = substr($digits, -3);
        $rest = substr($digits, 0, -3);
        $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
        $digits = $rest . ',' . $last3;
    }
    return 'Tk ' . $digits;
}

// ------------------------------------------------------------------ robots.txt

if ($path === '/robots.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: $origin/sitemap.xml\n";
    exit;
}

// ------------------------------------------------------------------ sitemap.xml

if ($path === '/sitemap.xml') {
    header('Content-Type: application/xml; charset=utf-8');
    $urls = [["$origin/", null], ["$origin/products", null], ["$origin/warranty", null], ["$origin/warranty-policy", null], ["$origin/pre-order", null], ["$origin/custom-pc", null], ["$origin/about", null]];
    try {
        $statuses = $settings['showSoldProducts'] ? "('available','preorder','sold')" : "('available','preorder')";
        foreach (Db::all("SELECT slug, updated_at FROM products WHERE is_published = 1 AND status IN $statuses ORDER BY updated_at DESC LIMIT 5000") as $row) {
            $urls[] = ["$origin/product/" . rawurlencode($row['slug']), substr((string) $row['updated_at'], 0, 10)];
        }
    } catch (Throwable) {
        // Database not ready yet: list the main pages only.
    }
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as [$loc, $lastmod]) {
        echo '  <url><loc>' . hb_e($loc) . '</loc>' . ($lastmod ? "<lastmod>$lastmod</lastmod>" : '') . "</url>\n";
    }
    echo "</urlset>\n";
    exit;
}

// ------------------------------------------------------------------ pages

$html = @file_get_contents(HB_DIST_DIR . '/index.html');
if ($html === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "index.html was not found. Build the website (npm run build in the client folder) and upload the files from client/dist.";
    exit;
}

$status = 200;
$meta = [
    'title' => "$site | " . $settings['tagline'],
    'description' => (string) $settings['metaDescription'],
    'image' => $settings['logoUrl'] ? $origin . $settings['logoUrl'] : "$origin/og-image.jpg",
    'type' => 'website',
    'url' => $origin . ($path === '/' ? '/' : $path),
    'robots' => 'index, follow',
];

if ($path === '/products') {
    $meta['title'] = "Products | $site";
    $meta['description'] = 'Browse available and pre-order second-hand PC parts and laptops at hyperByte: graphics cards, processors, RAM, SSDs, motherboards, power supplies and more.';
} elseif ($path === '/warranty') {
    $meta['title'] = "Warranty check | $site";
    $meta['description'] = 'Enter your hyperByte warranty code to see the product, the warranty period and how much time is left.';
} elseif ($path === '/warranty-policy') {
    $meta['title'] = "Warranty policy | $site";
    $meta['description'] = 'What the hyperByte warranty covers, how the warranty period is calculated and how to make a claim.';
} elseif ($path === '/pre-order') {
    $meta['title'] = "Pre-order | $site";
    $meta['description'] = 'Pre-order pre-owned or new PC parts and laptops through hyperByte: list what you want and send it on WhatsApp or Facebook.';
} elseif ($path === '/custom-pc') {
    $meta['title'] = "Custom PC build | $site";
    $meta['description'] = 'Plan an AM5 or DDR5 PC with hyperByte: choose your components, pre-owned or new, add your budget and send the list on WhatsApp or Facebook.';
} elseif ($path === '/about') {
    $meta['title'] = "About | $site";
    $meta['description'] = (string) $settings['metaDescription'];
} elseif (preg_match('#^/product/([^/]+)$#', $path, $m)) {
    $product = null;
    try {
        $product = Db::one(
            'SELECT p.id, p.name, p.sku, p.price, p.status, p.condition_grade, p.description, p.updated_at
             FROM products p WHERE p.slug = ? AND p.is_published = 1',
            [$m[1]]
        );
    } catch (Throwable) {
    }
    if ($product) {
        $statusText = Util::STATUSES[$product['status']] ?? '';
        $condition = Util::CONDITIONS[$product['condition_grade']] ?? '';
        $summary = trim(preg_replace('/\s+/', ' ', strip_tags((string) $product['description'])) ?? '');
        $meta['title'] = "{$product['name']} | $site";
        $meta['description'] = mb_substr(
            hb_taka($product['price'] === null ? null : (int) $product['price']) . ". $statusText. Condition: $condition. Product ID {$product['sku']}." . ($summary !== '' ? " $summary" : ''),
            0,
            300
        );
        $meta['type'] = 'product';
        $image = Db::value('SELECT path FROM product_images WHERE product_id = ? AND archived_at IS NULL ORDER BY sort_order, id LIMIT 1', [$product['id']]);
        if ($image) {
            $meta['image'] = $origin . $image;
        }
    } else {
        $status = 404;
        $meta['title'] = "Product not found | $site";
        $meta['robots'] = 'noindex';
    }
} elseif ($path === '/admin' || str_starts_with($path, '/admin/')) {
    $meta['title'] = "Admin | $site";
    $meta['robots'] = 'noindex, nofollow';
} elseif ($path !== '/') {
    $status = 404;
    $meta['title'] = "Page not found | $site";
    $meta['robots'] = 'noindex';
}

$tags = sprintf(
    "<meta name=\"description\" content=\"%s\" />\n    <meta name=\"robots\" content=\"%s\" />\n" .
    "    <link rel=\"canonical\" href=\"%s\" />\n" .
    "    <meta property=\"og:site_name\" content=\"%s\" />\n    <meta property=\"og:type\" content=\"%s\" />\n" .
    "    <meta property=\"og:title\" content=\"%s\" />\n    <meta property=\"og:description\" content=\"%s\" />\n" .
    "    <meta property=\"og:url\" content=\"%s\" />\n    <meta property=\"og:image\" content=\"%s\" />\n" .
    "    <meta name=\"twitter:card\" content=\"summary_large_image\" />",
    hb_e($meta['description']),
    hb_e($meta['robots']),
    hb_e($meta['url']),
    hb_e($site),
    hb_e($meta['type']),
    hb_e($meta['title']),
    hb_e($meta['description']),
    hb_e($meta['url']),
    hb_e($meta['image'])
);
$html = preg_replace('#<title>.*?</title>#s', '<title>' . hb_e($meta['title']) . '</title>', $html, 1) ?? $html;
$html = str_replace('<meta name="hb-seo" content="" />', $tags, $html);
$html = str_replace('<meta name="hb-seo" content="">', $tags, $html);

http_response_code($status);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
echo $html;
