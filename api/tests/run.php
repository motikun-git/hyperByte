<?php
// End-to-end tests for the HyperByte API. They start a private server with a
// temporary SQLite database, so your real data is never touched. Run from the
// HyperByte folder:
//   php api/tests/run.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('Run this from the command line.');
}
if (!extension_loaded('curl')) {
    fwrite(STDERR, "The PHP curl extension is needed for the tests (enable extension=curl in php.ini).\n");
    exit(1);
}
if (!extension_loaded('pdo_sqlite')) {
    fwrite(STDERR, "The tests use SQLite. Enable extension=pdo_sqlite in php.ini.\n");
    exit(1);
}

$projectRoot = dirname(__DIR__, 2);
$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'hyperbyte-test-' . bin2hex(random_bytes(4));
mkdir($tmp . '/uploads', 0777, true);
mkdir($tmp . '/dist', 0777, true);
file_put_contents($tmp . '/dist/index.html', "<!doctype html><html><head><title>HyperByte</title>\n<meta name=\"hb-seo\" content=\"\" /></head><body><div id=\"root\"></div></body></html>");

$port = 18000 + random_int(0, 2000);
$base = "http://127.0.0.1:$port";
$setupToken = 'test-setup-token-' . bin2hex(random_bytes(8));
$env = array_merge(getenv(), [
    'DB_DRIVER' => 'sqlite',
    'DB_PATH' => $tmp . '/test.sqlite',
    'UPLOAD_DIR' => $tmp . '/uploads',
    'ARCHIVE_DIR' => $tmp . '/archive',
    'SETUP_TOKEN' => $setupToken,
    'APP_URL' => $base,
    'APP_DEBUG' => 'true',
    'HB_DIST' => $tmp . '/dist',
]);
$server = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:$port", 'dev-router.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $tmp . '/server.log', 'a'], 2 => ['file', $tmp . '/server.log', 'a']],
    $pipes,
    $projectRoot,
    $env
);
if (!is_resource($server)) {
    fwrite(STDERR, "Could not start the test server.\n");
    exit(1);
}

function cleanup(): void
{
    global $server, $tmp;
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($tmp);
}
register_shutdown_function('cleanup');

// ------------------------------------------------------------------ tiny HTTP client

final class Client
{
    private array $cookies = [];
    public string $csrf = '';

    public function __construct(private string $base)
    {
    }

    public function call(string $method, string $path, mixed $body = null, array $opts = []): array
    {
        $ch = curl_init($this->base . $path);
        $headers = ['Accept: application/json'];
        if ($this->csrf !== '' && !($opts['noCsrf'] ?? false)) {
            $headers[] = 'X-CSRF-Token: ' . ($opts['csrf'] ?? $this->csrf);
        }
        foreach ($opts['headers'] ?? [] as $h) {
            $headers[] = $h;
        }
        if ($this->cookies) {
            $headers[] = 'Cookie: ' . implode('; ', array_map(fn ($k, $v) => "$k=$v", array_keys($this->cookies), $this->cookies));
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => 20,
        ]);
        if (isset($opts['multipart'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['multipart']);
        } elseif ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $raw = curl_exec($ch);
        if ($raw === false) {
            throw new RuntimeException('Request failed: ' . curl_error($ch));
        }
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $head = substr($raw, 0, $headerSize);
        $text = substr($raw, $headerSize);
        foreach (explode("\r\n", $head) as $line) {
            if (stripos($line, 'Set-Cookie:') === 0) {
                [$pair] = explode(';', trim(substr($line, 11)));
                [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
                if ($v === '' || $v === 'deleted') {
                    unset($this->cookies[$k]);
                } else {
                    $this->cookies[$k] = $v;
                }
            }
        }
        $json = json_decode($text, true);
        return ['status' => $status, 'json' => is_array($json) ? $json : null, 'text' => $text, 'headers' => $head];
    }

    public function get(string $p, array $o = []): array { return $this->call('GET', $p, null, $o); }
    public function post(string $p, mixed $b = null, array $o = []): array { return $this->call('POST', $p, $b ?? [], $o); }
    public function put(string $p, mixed $b = null, array $o = []): array { return $this->call('PUT', $p, $b ?? [], $o); }
    public function patch(string $p, mixed $b = null, array $o = []): array { return $this->call('PATCH', $p, $b ?? [], $o); }
    public function delete(string $p, mixed $b = null, array $o = []): array { return $this->call('DELETE', $p, $b, $o); }
}

// ------------------------------------------------------------------ assertions

$passed = 0;
$failed = [];
$current = '';

function test(string $name, callable $fn): void
{
    global $passed, $failed, $current;
    $current = $name;
    try {
        $fn();
        $passed++;
        echo "  \033[32m✓\033[0m $name\n";
    } catch (Throwable $e) {
        $failed[] = $name;
        echo "  \033[31m✗ $name\033[0m\n      " . $e->getMessage() . "\n";
    }
}

function eq(mixed $actual, mixed $expected, string $what = ''): void
{
    if ($actual !== $expected) {
        throw new RuntimeException(($what ? "$what: " : '') . 'expected ' . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

function ok(bool $condition, string $what): void
{
    if (!$condition) {
        throw new RuntimeException($what);
    }
}

function status(array $res, int $expected, string $what = ''): void
{
    if ($res['status'] !== $expected) {
        throw new RuntimeException(($what ? "$what: " : '') . "expected HTTP $expected, got {$res['status']}: " . substr($res['text'], 0, 300));
    }
}

function upload(string $field, string $bytes, string $name, string $mime): CURLStringFile
{
    return new CURLStringFile($bytes, $name, $mime);
}

// Wait for the server.
$guest = new Client($base);
for ($i = 0; $i < 50; $i++) {
    usleep(100_000);
    try {
        if ($guest->get('/api/health')['status'] === 200) {
            break;
        }
    } catch (Throwable) {
    }
}

$jpeg = base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gODAK/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAMABAAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A8+ooor9OOkKKK0bPQ9SvE3wWkhTAIZsICD0IzjP4VLko6tmdWtTormqSUV5uxnUVq3Hh7VbdAz2UhBOP3ZDn8lJNZVEZKWzFSr0qyvSkpLyd/wAgoooqjUKKKKAO78IaDFHbRX15EGuGIkiy2Qq44OOme/fHHQ11dc94Q1iK80+K1laOO5hAjVM8uoHBAPsDnHpnjNdDXj13JzfMflmcTxEsXP6xvfTtbpbyCsHxNoMWo28s9vEBfgDa27G/HY9unf2HOK3qyvEGsRaVZuwaNrogeXETyc9yBzjr+WM1NJyUlybmGXzxEMRF4b4r/wBX8u55dRRRXtH60FFFFACo7RuroxV1OQwOCD6it2z8V6nbJtZ45xgAeauSMe4wT+OawaKiUIz+JHPiMJRxKtWgpep0Nx4v1OVAqeRCc53Rpkn2+YkVgzSyTyGSaR5JG6s7Ek/iaZRRGnGHwoWHwdDDfwYKPogoooqzpP/Z');

$admin = new Client($base);
$ids = [];

echo "\nHyperByte API tests\n\n";

// ------------------------------------------------------------------ setup and login

echo "Setup and login\n";

test('a fresh install offers setup', function () use ($guest) {
    $r = $guest->get('/api/admin/status');
    status($r, 200);
    eq($r['json']['installed'], false, 'installed');
    eq($r['json']['setupAvailable'], true, 'setupAvailable');
});

test('setup refuses a wrong token and a weak password', function () use ($guest, $setupToken) {
    status($guest->post('/api/admin/setup', ['token' => 'nope', 'name' => 'A', 'email' => 'a@b.co', 'password' => 'abc12345678']), 422, 'wrong token');
    $r = $guest->post('/api/admin/setup', ['token' => $setupToken, 'name' => 'Moti', 'email' => 'owner@example.com', 'password' => 'short1']);
    status($r, 422, 'weak password');
    ok(isset($r['json']['errors']['password']), 'password error returned');
});

test('setup creates the first admin and logs in', function () use ($admin, $setupToken) {
    $r = $admin->post('/api/admin/setup', ['token' => $setupToken, 'name' => 'Moti', 'email' => 'Owner@Example.com', 'password' => 'correct-horse-42']);
    status($r, 200);
    eq($r['json']['admin']['email'], 'owner@example.com');
    ok(strlen($r['json']['csrf']) === 64, 'csrf token returned');
    $admin->csrf = $r['json']['csrf'];
    status($admin->get('/api/admin/me'), 200, 'me');
});

test('setup cannot run twice', function () use ($guest, $setupToken) {
    status($guest->post('/api/admin/setup', ['token' => $setupToken, 'name' => 'X', 'email' => 'x@example.com', 'password' => 'another-pass-99']), 409);
    eq($guest->get('/api/admin/status')['json']['setupAvailable'], false);
});

test('admin pages need a login', function () use ($guest) {
    status($guest->get('/api/admin/dashboard'), 401);
    status($guest->get('/api/admin/products'), 401);
    status($guest->post('/api/admin/products', ['name' => 'x']), 401);
});

test('changes need the CSRF token', function () use ($admin) {
    status($admin->post('/api/admin/products', ['name' => 'Test'], ['noCsrf' => true]), 403, 'missing');
    status($admin->post('/api/admin/products', ['name' => 'Test'], ['csrf' => str_repeat('a', 64)]), 403, 'wrong');
});

test('logout and login again', function () use ($admin) {
    status($admin->post('/api/admin/logout'), 200);
    status($admin->get('/api/admin/me'), 401, 'after logout');
    status($admin->post('/api/admin/login', ['email' => 'owner@example.com', 'password' => 'wrong-password-1']), 401, 'wrong password');
    $r = $admin->post('/api/admin/login', ['email' => 'OWNER@example.com ', 'password' => 'correct-horse-42']);
    status($r, 200, 'login');
    $admin->csrf = $r['json']['csrf'];
});

test('too many failed logins are blocked', function () use ($guest) {
    for ($i = 0; $i < 6; $i++) {
        status($guest->post('/api/admin/login', ['email' => 'nobody@example.com', 'password' => 'guess-' . $i]), 401, "attempt $i");
    }
    $r = $guest->post('/api/admin/login', ['email' => 'nobody@example.com', 'password' => 'guess-7']);
    status($r, 429, 'seventh attempt');
    ok(isset($r['json']['retryAfter']), 'retryAfter returned');
});

// ------------------------------------------------------------------ categories

echo "\nCategories\n";

test('the default categories exist', function () use ($admin, &$ids) {
    $r = $admin->get('/api/admin/categories');
    status($r, 200);
    $top = array_values(array_filter($r['json']['categories'], fn ($c) => $c['parentId'] === null));
    eq(array_column($top, 'slug'), ['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'psu', 'laptop', 'cpu-coolers', 'fans', 'cases', 'monitors', 'keyboards', 'mice', 'accessories']);
    foreach ($r['json']['categories'] as $c) {
        $ids['cat_' . $c['slug']] = $c['id'];
    }
    // Subcategories come right after their category.
    $slugs = array_column($r['json']['categories'], 'slug');
    eq(array_slice($slugs, 1, 4), ['gpu', 'nvidia-geforce', 'amd-radeon', 'other-graphics']);
    eq($r['json']['categories'][2]['parentId'], $ids['cat_gpu']);
    $ram = array_values(array_filter($r['json']['categories'], fn ($c) => $c['slug'] === 'ram'))[0];
    eq(array_slice($ram['specKeys'], 0, 4), ['Capacity', 'Memory type', 'Speed', 'CAS latency (CL)'], 'RAM spec order');
});

test('a category can be added, and its link name must be unique', function () use ($admin, &$ids) {
    $r = $admin->post('/api/admin/categories', ['name' => 'Gaming chairs', 'icon' => 'other', 'specKeys' => 'Material, Max weight']);
    status($r, 201);
    eq($r['json']['category']['slug'], 'gaming-chairs');
    eq($r['json']['category']['specKeys'], ['Material', 'Max weight']);
    $ids['cat_chairs'] = $r['json']['category']['id'];
    status($admin->post('/api/admin/categories', ['name' => 'Gaming Chairs']), 422, 'duplicate');
});

test('subcategories: one level only, and they can be added under a category', function () use ($admin, &$ids) {
    $r = $admin->post('/api/admin/categories', ['name' => 'Intel Arc', 'parentId' => $ids['cat_gpu']]);
    status($r, 201);
    eq($r['json']['category']['parentId'], $ids['cat_gpu']);
    $ids['cat_arc'] = $r['json']['category']['id'];
    status($admin->post('/api/admin/categories', ['name' => 'Too deep', 'parentId' => $ids['cat_arc']]), 422, 'no sub-subcategories');
    status($admin->put('/api/admin/categories/' . $ids['cat_gpu'], ['name' => 'GPU', 'parentId' => $ids['cat_cpu']]), 422, 'category with children cannot become a child');
    $r = $admin->delete('/api/admin/categories/' . $ids['cat_gpu']);
    status($r, 409, 'cannot delete a category that has subcategories');
    status($admin->delete('/api/admin/categories/' . $ids['cat_arc']), 200, 'empty subcategory can be deleted');
});

// ------------------------------------------------------------------ products

echo "\nProducts\n";

test('product form validation', function () use ($admin) {
    $r = $admin->post('/api/admin/products', ['name' => 'x']);
    status($r, 422);
    foreach (['name', 'categoryId', 'condition'] as $field) {
        ok(isset($r['json']['errors'][$field]), "error for $field");
    }
    $r = $admin->post('/api/admin/products', ['name' => 'Cheap GPU', 'categoryId' => 2, 'condition' => 'good', 'price' => 5000, 'originalPrice' => 4000]);
    status($r, 422, 'original price lower than price');
    ok(isset($r['json']['errors']['originalPrice']), 'originalPrice error');
});

$newProduct = function (array $over) use ($admin, &$ids): array {
    $r = $admin->post('/api/admin/products', array_merge([
        'name' => 'Test product',
        'categoryId' => $ids['cat_gpu'],
        'condition' => 'excellent',
        'status' => 'available',
        'isPublished' => true,
    ], $over));
    status($r, 201, 'create ' . ($over['name'] ?? ''));
    return $r['json']['product'];
};

test('create available, pre-order, sold and hidden products', function () use ($newProduct, &$ids) {
    $gpu = $newProduct([
        'name' => 'MSI GeForce RTX 3060 Ventus 2X 12G', 'brand' => 'MSI', 'model' => 'RTX 3060 Ventus 2X',
        'price' => '25,500', 'originalPrice' => 36000, 'isFeatured' => true,
        'specs' => [['key' => 'Memory', 'value' => '12 GB GDDR6'], ['key' => 'Bus width', 'value' => '192-bit'], ['key' => '', 'value' => 'skip']],
        'description' => "Used for one year.\nNever used for mining.", 'warrantyInfo' => '15-day checking warranty', 'warrantyDays' => 15,
    ]);
    eq($gpu['sku'], 'HB-1001', 'sku');
    eq($gpu['price'], 25500, 'price parsed');
    eq($gpu['discountPct'], 29, 'discount');
    eq(count($gpu['specs']), 2, 'empty spec removed');
    eq($gpu['slug'], 'msi-geforce-rtx-3060-ventus-2x-12g-hb-1001', 'slug');
    $ids['gpu'] = $gpu;

    $pre = $newProduct(['name' => 'AMD Ryzen 7 9800X3D', 'categoryId' => $ids['cat_cpu'], 'status' => 'preorder', 'condition' => 'like_new', 'brand' => 'AMD']);
    eq($pre['price'], null, 'contact for price');
    $ids['pre'] = $pre;

    $sold = $newProduct(['name' => 'Zotac GTX 1660 Super', 'brand' => 'Zotac', 'status' => 'sold', 'price' => 13800, 'condition' => 'good']);
    ok($sold['soldAt'] !== null, 'sold date set');
    $ids['sold'] = $sold;

    $ids['ram'] = $newProduct(['name' => 'Corsair Vengeance 16GB DDR4 3200', 'categoryId' => $ids['cat_ram'], 'price' => 3900, 'condition' => 'good', 'brand' => 'Corsair']);
    $ids['hidden'] = $newProduct(['name' => 'Secret unpublished GPU', 'isPublished' => false, 'price' => 1000]);
});

test('public list shows published products, sold ones last', function () use ($guest, &$ids) {
    $r = $guest->get('/api/products');
    status($r, 200);
    $names = array_column($r['json']['items'], 'name');
    ok(!in_array('Secret unpublished GPU', $names, true), 'unpublished is hidden');
    eq($r['json']['total'], 4, 'total');
    eq(end($r['json']['items'])['status'], 'sold', 'sold is last');
    foreach ($r['json']['items'] as $item) {
        ok(!isset($item['dbId']) && !isset($item['isPublished']), 'no admin fields in public data');
    }
});

test('filters: status, category, condition, price and search', function () use ($guest) {
    $q = fn (string $query) => $guest->get('/api/products?' . $query)['json'];
    eq(array_column($q('status=available')['items'], 'status'), ['available', 'available']);
    eq($q('status=preorder')['items'][0]['name'], 'AMD Ryzen 7 9800X3D');
    eq($q('category=ram')['total'], 1, 'category');
    eq($q('condition=like_new')['total'], 1, 'condition');
    eq($q('min=20000')['total'], 1, 'min price excludes contact-for-price');
    eq($q('q=gddr6')['items'][0]['id'], 'HB-1001', 'search in specs');
    eq($q('q=3060%20msi')['total'], 1, 'multi-word search');
    eq($q('q=HB-1004')['items'][0]['name'], 'Corsair Vengeance 16GB DDR4 3200', 'search by product ID');
    eq($q('q=nothing-like-this')['total'], 0, 'no results');
    $sorted = $q('sort=price_asc&status=available');
    eq(array_column($sorted['items'], 'price'), [3900, 25500], 'price low to high');
    eq($q('status=sold&sort=recently_sold')['items'][0]['name'], 'Zotac GTX 1660 Super', 'recently sold');
    eq($q('category=gpu')['priceRange'], ['min' => 13800, 'max' => 25500], 'price range');
    eq($q('status=available,preorder')['total'], 3, 'for sale = available + pre-order');
    eq($q('status=available,bogus')['total'], 2, 'unknown statuses are ignored');
    eq($q('status=bogus')['total'], 0, 'only unknown statuses');
    eq(count($q('limit=2&page=2')['items']), 2, 'second page');
    eq($q('limit=2&page=2')['pages'], 2, 'page count');
});

test('product page: published only, unpublished can be previewed by the admin', function () use ($guest, $admin, &$ids) {
    $r = $guest->get('/api/products/' . $ids['gpu']['slug']);
    status($r, 200);
    eq($r['json']['product']['description'], "Used for one year.\nNever used for mining.");
    status($guest->get('/api/products/' . $ids['hidden']['slug']), 404, 'unpublished');
    status($guest->get('/api/admin/preview/' . $ids['hidden']['slug']), 401, 'guest preview');
    status($admin->get('/api/admin/preview/' . $ids['hidden']['slug']), 200, 'admin preview');
});

test('home page sections', function () use ($guest) {
    $r = $guest->get('/api/home');
    status($r, 200);
    eq(array_column($r['json']['featured'], 'id'), ['HB-1001'], 'featured');
    eq(count($r['json']['available']), 2, 'available');
    eq(count($r['json']['preorder']), 1, 'preorder');
    eq(count($r['json']['sold']), 1, 'sold');
    $gpu = array_values(array_filter($r['json']['categories'], fn ($c) => $c['slug'] === 'gpu'))[0];
    eq([$gpu['available'], $gpu['total']], [1, 2], 'category counts');
});

test('hiding sold products from the public lists', function () use ($guest, $admin, &$ids) {
    status($admin->put('/api/admin/settings', ['showSoldProducts' => false]), 200);
    eq($guest->get('/api/products')['json']['total'], 3, 'sold hidden');
    eq($guest->get('/api/products?status=sold')['json']['total'], 0, 'status=sold empty');
    eq($guest->get('/api/products?status=available,sold')['json']['total'], 2, 'sold dropped from a status list');
    eq($guest->get('/api/home')['json']['sold'], [], 'home sold empty');
    status($guest->get('/api/products/' . $ids['sold']['slug']), 200, 'direct link still shows it as sold');
    status($admin->put('/api/admin/settings', ['showSoldProducts' => true]), 200);
});

test('quick changes: unpublish, feature, mark sold', function () use ($guest, $admin, &$ids) {
    $id = $ids['ram']['dbId'];
    status($admin->patch("/api/admin/products/$id", ['isPublished' => false]), 200);
    status($guest->get('/api/products/' . $ids['ram']['slug']), 404, 'unpublished now');
    $r = $admin->patch("/api/admin/products/$id", ['isPublished' => true, 'status' => 'sold', 'isFeatured' => true]);
    eq([$r['json']['product']['status'], $r['json']['product']['isFeatured']], ['sold', true]);
    ok($r['json']['product']['soldAt'] !== null, 'sold date');
    $r = $admin->patch("/api/admin/products/$id", ['status' => 'available']);
    eq($r['json']['product']['soldAt'], null, 'sold date cleared');
    eq(array_column($guest->get('/api/home')['json']['featured'], 'id'), ['HB-1001', 'HB-1004'], 'featured list, graphics cards first');
});

test('admin list views and counts', function () use ($admin) {
    $r = $admin->get('/api/admin/products?view=unpublished');
    eq(array_column($r['json']['items'], 'name'), ['Secret unpublished GPU']);
    eq($r['json']['counts']['unpublished'], 1);
    eq($r['json']['counts']['preorder'], 1);
    eq($admin->get('/api/admin/products?view=featured')['json']['total'], 2);
});

test('editing a product keeps its ID and link', function () use ($admin, &$ids) {
    $p = $ids['gpu'];
    $r = $admin->put('/api/admin/products/' . $p['dbId'], [
        'name' => 'MSI RTX 3060 Ventus 2X 12GB', 'categoryId' => $p['categoryId'], 'brand' => 'MSI', 'condition' => 'good',
        'status' => 'available', 'isPublished' => true, 'isFeatured' => true, 'price' => 24500, 'originalPrice' => null,
        'specs' => [['key' => 'Memory', 'value' => '12 GB GDDR6']],
    ]);
    status($r, 200);
    eq([$r['json']['product']['sku'], $r['json']['product']['slug']], [$p['sku'], $p['slug']]);
    eq([$r['json']['product']['price'], $r['json']['product']['discountPct']], [24500, 0]);
    status($admin->put('/api/admin/products/' . $p['dbId'], ['name' => 'X', 'categoryId' => 999, 'condition' => 'bad']), 422);
    $r = $admin->put('/api/admin/products/' . $ids['pre']['dbId'], [
        'name' => 'AMD Ryzen 7 9800X3D', 'categoryId' => $ids['cat_cpu'], 'condition' => 'like_new', 'status' => 'preorder', 'isPublished' => true, 'sku' => 'HB-1001',
    ]);
    status($r, 422, 'duplicate product ID');
});

// ------------------------------------------------------------------ photos

echo "\nPhotos\n";

test('photos are checked, re-saved and ordered', function () use ($admin, $jpeg, &$ids, $tmp) {
    $id = $ids['gpu']['dbId'];
    $r = $admin->post("/api/admin/products/$id/images", null, ['multipart' => [
        'images[0]' => upload('images', $jpeg, 'front.jpg', 'image/jpeg'),
        'images[1]' => upload('images', $jpeg, 'back.jpg', 'image/jpeg'),
    ]]);
    status($r, 200);
    $images = $r['json']['product']['images'];
    eq(count($images), 2, 'two photos');
    foreach ($images as $img) {
        ok(is_file($tmp . '/uploads' . substr($img['url'], strlen('/uploads'))), 'file saved: ' . $img['url']);
        ok(is_file($tmp . '/uploads' . substr($img['thumb'], strlen('/uploads'))), 'thumbnail saved');
    }
    $file = $tmp . '/uploads' . substr($images[0]['url'], strlen('/uploads'));
    ok(!str_contains((string) file_get_contents($file), 'CREATOR'), 're-encoded (metadata removed)');
    $ids['images'] = $images;
    $r = $admin->put("/api/admin/products/$id/images/order", ['ids' => [$images[1]['id'], $images[0]['id']]]);
    eq($r['json']['product']['images'][0]['id'], $images[1]['id'], 'new cover');
    status($admin->put("/api/admin/products/$id/images/order", ['ids' => [$images[0]['id']]]), 422, 'incomplete order');
});

test('fake images and scripts are rejected', function () use ($admin, &$ids) {
    $id = $ids['gpu']['dbId'];
    $r = $admin->post("/api/admin/products/$id/images", null, ['multipart' => [
        'images[0]' => upload('images', "<?php echo 'hacked'; ?>", 'shell.php.jpg', 'image/jpeg'),
    ]]);
    status($r, 422, 'php disguised as jpg');
    $r = $admin->post("/api/admin/products/$id/images", null, ['multipart' => [
        'images[0]' => upload('images', 'GIF89a' . str_repeat('x', 100), 'anim.gif', 'image/gif'),
    ]]);
    status($r, 422, 'gif not allowed');
    status($admin->post("/api/admin/products/$id/images", null, ['multipart' => ['other' => 'x']]), 422, 'no files');
});

test('public product shows the photos and the sold label data', function () use ($guest, &$ids) {
    $r = $guest->get('/api/products/' . $ids['gpu']['slug']);
    eq(count($r['json']['product']['images']), 2);
    $card = $guest->get('/api/products?q=HB-1001')['json']['items'][0];
    eq($card['imageCount'], 2);
    ok(str_ends_with($card['image']['thumb'], '_t.webp') || str_ends_with($card['image']['thumb'], '_t.jpg'), 'card uses thumbnail');
});

test('a photo can be deleted (file removed too)', function () use ($admin, &$ids, $tmp) {
    $id = $ids['gpu']['dbId'];
    $img = $ids['images'][0];
    $r = $admin->delete("/api/admin/products/$id/images/{$img['id']}");
    status($r, 200);
    eq(count($r['json']['product']['images']), 1);
    ok(!is_file($tmp . '/uploads' . substr($img['url'], strlen('/uploads'))), 'file deleted');
});

test('POST with X-HTTP-Method-Override works (for strict hosts)', function () use ($admin, &$ids) {
    $id = $ids['ram']['dbId'];
    $r = $admin->post("/api/admin/products/$id", ['isFeatured' => false], ['headers' => ['X-HTTP-Method-Override: PATCH']]);
    status($r, 200);
    eq($r['json']['product']['isFeatured'], false);
});

test('a product can have at most 10 photos', function () use ($admin, $jpeg, &$ids) {
    $id = $ids['ram']['dbId'];
    $files = [];
    for ($i = 0; $i < 11; $i++) {
        $files["images[$i]"] = upload('images', $jpeg, "p$i.jpg", 'image/jpeg');
    }
    status($admin->post("/api/admin/products/$id/images", null, ['multipart' => $files]), 422, '11 photos refused');
});

echo "\nSubcategories, availability and sold photos\n";

test('products can have a subcategory, and the public list filters by it', function () use ($admin, $guest, $newProduct, &$ids) {
    $p = $newProduct(['name' => 'Gigabyte RTX 4060 Eagle OC 8G', 'subcategoryId' => $ids['cat_nvidia-geforce'], 'price' => 34000, 'brand' => 'Gigabyte']);
    eq($p['subcategoryId'], $ids['cat_nvidia-geforce'], 'saved');
    eq($p['subcategory']['slug'], 'nvidia-geforce', 'card shape');
    $ids['sub'] = $p;
    eq(array_column($guest->get('/api/products?sub=nvidia-geforce')['json']['items'], 'name'), ['Gigabyte RTX 4060 Eagle OC 8G'], 'filter by subcategory');
    eq($guest->get('/api/products?category=nvidia-geforce')['json']['total'], 1, 'subcategory slug also works as category');
    $r = $admin->post('/api/admin/products', ['name' => 'Wrong pair', 'categoryId' => $ids['cat_gpu'], 'subcategoryId' => $ids['cat_ddr4'], 'condition' => 'good']);
    status($r, 422, 'subcategory of another category');
    ok(isset($r['json']['errors']['subcategoryId']), 'subcategory error');
    $cats = $guest->get('/api/categories')['json']['categories'];
    $gpu = array_values(array_filter($cats, fn ($c) => $c['slug'] === 'gpu'))[0];
    eq(array_column($gpu['children'], 'slug'), ['nvidia-geforce', 'amd-radeon', 'other-graphics'], 'children listed');
    eq($gpu['children'][0]['available'], 1, 'child count');
    ok(!in_array('nvidia-geforce', array_column($cats, 'slug'), true), 'subcategories are not top-level');
});

test('unavailable products are hidden from lists but keep their page', function () use ($admin, $guest, &$ids) {
    $p = $ids['sub'];
    status($admin->patch("/api/admin/products/{$p['dbId']}", ['status' => 'unavailable']), 200);
    eq($guest->get('/api/products?q=eagle')['json']['total'], 0, 'not listed');
    eq($guest->get('/api/products?q=eagle&status=unavailable')['json']['total'], 0, 'cannot be requested as a list');
    $r = $guest->get('/api/products/' . $p['slug']);
    status($r, 200, 'page still works');
    eq($r['json']['product']['status'], 'unavailable');
    eq($admin->get('/api/admin/products?view=unavailable')['json']['counts']['unavailable'], 1, 'admin count');
});

test('pre-order products can show an expected arrival', function () use ($admin, $guest, &$ids) {
    $p = $admin->get('/api/admin/products/' . $ids['pre']['dbId'])['json']['product'];
    $body = array_merge($p, ['expectedAvailability' => 'Around mid-November', 'stockRef' => 'Supplier: Ryans list 12', 'condition' => $p['condition']]);
    $r = $admin->put('/api/admin/products/' . $p['dbId'], $body);
    status($r, 200);
    eq($r['json']['product']['stockRef'], 'Supplier: Ryans list 12', 'stock reference saved');
    $pub = $guest->get('/api/products/' . $p['slug'])['json']['product'];
    eq($pub['expectedAvailability'], 'Around mid-November', 'shown publicly');
    ok(!array_key_exists('stockRef', $pub), 'stock reference stays private');
});

test('selling a product archives all photos but the cover, and un-selling restores them', function () use ($admin, $guest, $jpeg, &$ids, $tmp) {
    $id = $ids['sub']['dbId'];
    $r = $admin->post("/api/admin/products/$id/images", null, ['multipart' => [
        'images[0]' => upload('images', $jpeg, 'a.jpg', 'image/jpeg'),
        'images[1]' => upload('images', $jpeg, 'b.jpg', 'image/jpeg'),
        'images[2]' => upload('images', $jpeg, 'c.jpg', 'image/jpeg'),
    ]]);
    status($r, 200);
    $images = $r['json']['product']['images'];
    $r = $admin->patch("/api/admin/products/$id", ['status' => 'sold']);
    eq(count($r['json']['product']['images']), 1, 'only the cover stays visible');
    eq($r['json']['product']['images'][0]['id'], $images[0]['id'], 'the cover is kept');
    eq(count($r['json']['product']['archivedImages']), 2, 'two archived');
    $moved = $images[1]['url'];
    ok(!is_file($tmp . '/uploads' . substr($moved, 8)), 'archived photo left the public folder');
    ok(is_file($tmp . '/archive' . substr($moved, 8)), 'archived photo is kept privately');
    eq(count($guest->get('/api/products/' . $ids['sub']['slug'])['json']['product']['images']), 1, 'public page shows the cover only');

    $r = $admin->patch("/api/admin/products/$id", ['status' => 'available']);
    eq(count($r['json']['product']['images']), 3, 'photos are back when it is for sale again');
    eq(array_column($r['json']['product']['images'], 'id'), array_column($images, 'id'), 'same order');
    ok(is_file($tmp . '/uploads' . substr($moved, 8)), 'file is back in the public folder');

    status($admin->put('/api/admin/settings', ['soldPhotoPolicy' => 'keep']), 200);
    $r = $admin->patch("/api/admin/products/$id", ['status' => 'sold']);
    eq(count($r['json']['product']['images']), 3, 'policy "keep" leaves photos alone');
    status($admin->patch("/api/admin/products/$id", ['status' => 'available']), 200);
    status($admin->put('/api/admin/settings', ['soldPhotoPolicy' => 'archive', 'soldPhotoRetentionDays' => 30]), 200);
    status($admin->put('/api/admin/settings', ['soldPhotoPolicy' => 'shred']), 422, 'unknown policy');
});

test('archived photos are deleted after the retention period', function () use ($admin, &$ids, $tmp) {
    $id = $ids['sub']['dbId'];
    $r = $admin->patch("/api/admin/products/$id", ['status' => 'sold']);
    $archived = $r['json']['product']['archivedImages'];
    eq(count($archived), 2);
    // Pretend they were archived 40 days ago.
    $db = new PDO('sqlite:' . $tmp . '/test.sqlite');
    $db->exec("UPDATE product_images SET archived_at = '2000-01-01 00:00:00' WHERE archived_at IS NOT NULL");
    status($admin->get('/api/admin/dashboard'), 200, 'dashboard runs the cleanup');
    $p = $admin->get("/api/admin/products/$id")['json']['product'];
    eq(count($p['archivedImages']), 0, 'archived photos deleted');
    eq(count($p['images']), 1, 'cover kept');
    $left = glob($tmp . '/archive/products/*/*/*') ?: [];
    eq(count($left), 0, 'archive files removed');
});

echo "\nPre-order and sourcing inquiries\n";

test('inquiries: create, update, search, delete', function () use ($admin, $guest, &$ids) {
    status($guest->get('/api/admin/inquiries'), 401, 'admin only');
    $r = $admin->post('/api/admin/inquiries', ['productId' => $ids['pre']['dbId'], 'customerName' => 'Rakib', 'customerContact' => '01711111111', 'expectedPrice' => '62,000', 'eta' => '2026-11-20', 'notes' => 'Wants the boxed version']);
    status($r, 201);
    $q = $r['json']['inquiry'];
    ok(preg_match('/^HBQ-\d{4,}$/', $q['ref']) === 1, 'reference id: ' . $q['ref']);
    eq([$q['productName'], $q['status'], $q['expectedPrice'], $q['eta']], ['AMD Ryzen 7 9800X3D', 'inquiry', 62000, '2026-11-20']);
    ok($q['inquiryDate'] !== null, 'date defaults to today');
    $r = $admin->put('/api/admin/inquiries/' . $q['id'], array_merge($q, ['status' => 'sourcing']));
    eq($r['json']['inquiry']['status'], 'sourcing');
    status($admin->put('/api/admin/inquiries/' . $q['id'], array_merge($q, ['status' => 'paid'])), 422, 'unknown status');
    status($admin->post('/api/admin/inquiries', ['productName' => 'x', 'eta' => 'soon']), 422, 'bad name and date');
    $other = $admin->post('/api/admin/inquiries', ['productName' => 'RTX 5090 (not listed)', 'customerName' => 'Nadia', 'status' => 'completed'])['json']['inquiry'];
    $list = $admin->get('/api/admin/inquiries?status=open')['json'];
    eq(array_column($list['items'], 'id'), [$q['id']], 'open list');
    eq($list['counts']['open'], 1);
    eq($list['counts']['completed'], 1);
    eq($admin->get('/api/admin/inquiries?q=nadia')['json']['items'][0]['id'], $other['id'], 'search by customer');
    eq($admin->get('/api/admin/dashboard')['json']['inquiries']['open'], 1, 'dashboard count');
    status($admin->delete('/api/admin/inquiries/' . $other['id']), 200);
    status($admin->get('/api/admin/inquiries/' . $other['id']), 404, 'deleted');
    $public = json_encode($guest->get('/api/products/' . $ids['pre']['slug'])['json']);
    ok(!str_contains($public, 'Rakib') && !str_contains($public, '01711111111'), 'customer details never public');
});

test('new settings: policy pages and custom build message', function () use ($admin, $guest) {
    $s = $guest->get('/api/settings')['json']['settings'];
    ok(str_contains($s['warrantyPolicy'], '## What the warranty covers'), 'draft policy');
    ok(str_starts_with($s['customBuildMessage'], 'Hello HyperByte'), 'custom build message');
    eq($s['instagramUrl'], 'https://www.instagram.com/hyperbyte_cn', 'instagram');
    ok(!array_key_exists('soldPhotoPolicy', $s), 'photo policy is admin-only');
    status($admin->put('/api/admin/settings', ['aboutText' => "We sell used GPUs.\n\n- Tested"]), 200);
    eq($guest->get('/api/settings')['json']['settings']['aboutText'], "We sell used GPUs.\n\n- Tested");
});

// ------------------------------------------------------------------ warranties

echo "\nWarranties\n";

test('create a memo with two products, serial numbers, discount and payment', function () use ($admin, &$ids) {
    $r = $admin->post('/api/admin/warranties', [
        'customerName' => 'Karim', 'customerPhone' => '+880 1712-345678', 'paymentMethod' => 'cash', 'discount' => '500',
        'startsAt' => '2026-01-10', 'internalNotes' => 'Paid in full', 'terms' => '',
        'items' => [
            ['productId' => $ids['gpu']['dbId'], 'quantity' => 1, 'serials' => ['GPU-SN-1'], 'unitPrice' => '25,500', 'warrantyValue' => 30, 'warrantyUnit' => 'day'],
            ['productName' => 'Kingston 8GB DDR4', 'quantity' => 2, 'serials' => "RAM-A\nRAM-B", 'unitPrice' => 2000, 'warrantyValue' => 1, 'warrantyUnit' => 'month', 'warrantyNote' => '7 Days Replacement', 'warrantyType' => 'service'],
        ],
    ]);
    status($r, 201);
    $w = $r['json']['warranty'];
    ok((bool) preg_match('/^HBW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/', $w['code']), 'code format ' . $w['code']);
    ok((bool) preg_match('/^\d{10}$/', (string) $w['invoiceNo']), 'memo number ' . $w['invoiceNo']);
    eq(count($w['items']), 2);
    eq($w['items'][0]['productName'], 'MSI RTX 3060 Ventus 2X 12GB', 'product name copied');
    eq($w['items'][0]['productRef'], 'HB-1001', 'product ID copied');
    eq($w['items'][0]['expiresAt'], '2026-02-08T18:00:00Z', 'GPU: start + 30 days');
    eq($w['items'][1]['expiresAt'], '2026-02-09T18:00:00Z', 'RAM: start + 1 month');
    eq($w['items'][1]['serials'], ['RAM-A', 'RAM-B']);
    eq($w['items'][1]['period'], '1 Month');
    eq($w['items'][0]['typeLabel'], 'Warranty', 'plain warranty by default');
    eq($w['items'][1]['typeLabel'], 'Service Warranty');
    eq($w['memo']['items'][0]['line'], '30 Days Warranty', 'memo line: warranty');
    eq($w['memo']['items'][1]['line'], '7 Days Replacement | 1 Month Service Warranty', 'memo line: service warranty');
    eq((float) $w['subtotal'], 29500.0);
    eq((float) $w['total'], 29000.0);
    eq($w['paymentLabel'], 'Cash');
    eq($w['status'], 'expired', 'dates in the past');
    eq($w['productName'], 'MSI RTX 3060 Ventus 2X 12GB + 1 more');
    ok(str_contains($w['terms'], 'This warranty covers'), 'default terms saved with the memo');
    $ids['w_old'] = $w;
});

test('active memo without discount', function () use ($admin, &$ids) {
    $r = $admin->post('/api/admin/warranties', [
        'customerName' => 'Nadia', 'customerPhone' => '01812345678', 'paymentMethod' => 'mobile', 'startsAt' => gmdate('Y-m-d\TH:i:s\Z'),
        'items' => [['productName' => 'Dell Latitude 7490', 'quantity' => 1, 'serials' => ['DL-7490-XYZ'], 'unitPrice' => 45000, 'warrantyValue' => 6, 'warrantyUnit' => 'month']],
    ]);
    status($r, 201);
    $w = $r['json']['warranty'];
    eq($w['status'], 'active');
    eq((float) $w['discount'], 0.0);
    ok($w['items'][0]['remainingSeconds'] > 180 * 86400, 'remaining time');
    $ids['w_active'] = $w;
});

test('memo validation', function () use ($admin) {
    $base = ['customerName' => 'Rafi', 'customerPhone' => '01911111111', 'paymentMethod' => 'transfer'];
    $item = ['productName' => 'SSD 1TB', 'quantity' => 1, 'unitPrice' => 9000, 'warrantyValue' => 1, 'warrantyUnit' => 'year'];
    status($admin->post('/api/admin/warranties', $base), 422, 'no products');
    $r = $admin->post('/api/admin/warranties', ['items' => [$item]]);
    status($r, 422, 'no customer');
    ok(isset($r['json']['errors']['customerName'], $r['json']['errors']['customerPhone'], $r['json']['errors']['paymentMethod']), 'name, phone and payment required');
    $r = $admin->post('/api/admin/warranties', $base + ['items' => [['serials' => ['A', 'B']] + $item]]);
    ok(isset($r['json']['errors']['items.0.serials']), 'more serials than units');
    $r = $admin->post('/api/admin/warranties', $base + ['discount' => 10000, 'items' => [$item]]);
    ok(isset($r['json']['errors']['discount']), 'discount more than subtotal');
    $r = $admin->post('/api/admin/warranties', $base + ['items' => [['productId' => 99999] + $item]]);
    ok(isset($r['json']['errors']['items.0.productName']), 'missing product');
    $r = $admin->post('/api/admin/warranties', $base + ['items' => [['unitPrice' => 'abc'] + $item]]);
    ok(isset($r['json']['errors']['items.0.unitPrice']), 'price needed');
});

test('public lookup shows every product with serials, never private data', function () use ($guest, &$ids) {
    $w = $ids['w_active'];
    $r = $guest->get('/api/warranty/' . rawurlencode(strtolower(str_replace('-', ' ', $w['code']))));
    status($r, 200);
    eq($r['json']['status'], 'active');
    eq($r['json']['items'][0]['name'], 'Dell Latitude 7490');
    eq($r['json']['items'][0]['serials'], ['DL-7490-XYZ'], 'full serial number');
    foreach (['customer', 'internal', 'Nadia', '01812345678', '45000', 'Price', 'payment', 'dbId', 'invoice'] as $secret) {
        ok(!str_contains($r['text'], $secret), "no '$secret' in public response");
    }
    ok(isset($r['json']['serverTime']), 'server time for an accurate countdown');
    $old = $guest->get('/api/warranty/' . $ids['w_old']['code'])['json'];
    eq($old['status'], 'expired');
    eq(count($old['items']), 2);
    eq($old['items'][0]['slug'], $ids['gpu']['slug'], 'link to the product page');
    eq($old['items'][1]['note'], '7 Days Replacement');
    eq($old['items'][1]['type'], 'Service Warranty', 'type shown publicly');
    ok(!str_contains(json_encode($old), 'Karim'), 'no customer name');
    $none = $guest->get('/api/warranty/HBW-AAAA-BBBB');
    status($none, 404);
    eq($none['json']['status'], 'not_registered');
    status($guest->get('/api/warranty/' . rawurlencode("' OR 1=1 --")), 404, 'junk input');
});

test('extend, void and restore one product or the whole memo', function () use ($admin, $guest, &$ids) {
    $w = $ids['w_old'];
    $ram = $w['items'][1]['id'];
    $r = $admin->post("/api/admin/warranties/{$w['id']}/void", ['reason' => 'Returned', 'itemId' => $ram]);
    eq($r['json']['warranty']['items'][1]['status'], 'void', 'one product void');
    eq($r['json']['warranty']['status'], 'expired', 'memo itself not void');
    $r = $admin->post("/api/admin/warranties/{$w['id']}/extend", ['days' => 10]);
    status($r, 200);
    eq($r['json']['warranty']['items'][0]['status'], 'active', 'GPU extended from today');
    eq($r['json']['warranty']['items'][1]['status'], 'void', 'void product not extended');
    eq($r['json']['warranty']['status'], 'active');
    $pub = $guest->get('/api/warranty/' . $w['code']);
    eq($pub['json']['items'][1]['status'], 'void');
    ok(!str_contains($pub['text'], 'Returned'), 'void reason stays private');
    $r = $admin->post("/api/admin/warranties/{$w['id']}/restore", ['itemId' => $ram]);
    eq($r['json']['warranty']['items'][1]['status'], 'expired', 'restored product');
    $r = $admin->post("/api/admin/warranties/{$w['id']}/void", ['reason' => 'Fraud']);
    eq($r['json']['warranty']['status'], 'void');
    eq($guest->get('/api/warranty/' . $w['code'])['json']['items'][0]['status'], 'void', 'whole memo void');
    eq($admin->post("/api/admin/warranties/{$w['id']}/restore")['json']['warranty']['status'], 'active');
    status($admin->post("/api/admin/warranties/{$w['id']}/extend", ['days' => 0]), 422, 'zero days');
    status($admin->post("/api/admin/warranties/{$w['id']}/void", ['itemId' => 99999]), 404, 'product not on memo');
});

test('editing a memo keeps its code, number and extended dates', function () use ($admin, &$ids) {
    $w = $admin->get("/api/admin/warranties/{$ids['w_old']['id']}")['json']['warranty'];
    $items = array_map(static fn ($i) => [
        'id' => $i['id'], 'productId' => $i['productId'], 'productName' => $i['productName'], 'quantity' => $i['quantity'],
        'serials' => $i['serials'], 'unitPrice' => $i['unitPrice'], 'warrantyValue' => $i['warrantyValue'], 'warrantyUnit' => $i['warrantyUnit'],
    ], $w['items']);
    $items[] = ['productName' => 'Cooler Master fan', 'quantity' => 1, 'unitPrice' => 800];
    $r = $admin->put("/api/admin/warranties/{$w['id']}", [
        'customerName' => 'Karim Uddin', 'customerPhone' => $w['customerPhone'], 'paymentMethod' => 'transfer', 'discount' => 500, 'startsAt' => $w['startsAt'], 'items' => $items,
    ]);
    status($r, 200);
    $e = $r['json']['warranty'];
    eq($e['code'], $w['code'], 'code unchanged');
    eq($e['invoiceNo'], $w['invoiceNo'], 'memo number unchanged');
    eq($e['items'][0]['expiresAt'], $w['items'][0]['expiresAt'], 'extension kept');
    eq(count($e['items']), 3);
    eq($e['items'][2]['status'], 'none', 'product without warranty');
    eq((float) $e['total'], 29800.0);
    array_pop($items);
    eq(count($admin->put("/api/admin/warranties/{$w['id']}", ['customerName' => 'Karim Uddin', 'customerPhone' => $w['customerPhone'], 'paymentMethod' => 'transfer', 'discount' => 500, 'startsAt' => $w['startsAt'], 'items' => $items])['json']['warranty']['items']), 2, 'product removed');
});

test('a memo downloads again exactly as it was issued', function () use ($admin, &$ids) {
    $id = $ids['w_old']['id'];
    $before = $admin->get("/api/admin/warranties/$id")['json']['warranty']['memo'];
    eq($before['items'][0]['line'], '30 Days Warranty', 'warranty line');
    eq($before['items'][1]['line'], '1 Month Warranty', 'type reset by the edit above (no warrantyType sent)');
    eq($before['seller']['name'], 'hyperByte');
    status($admin->put('/api/admin/settings', ['memoAddress' => 'Somewhere else, Dhaka']), 200);
    status($admin->post("/api/admin/warranties/$id/extend", ['days' => 5]), 200);
    $after = $admin->get("/api/admin/warranties/$id")['json']['warranty']['memo'];
    unset($before['savedAt'], $after['savedAt']);
    eq($after, $before, 'same memo after a settings change and an extension');
    $new = $admin->post('/api/admin/warranties', [
        'customerName' => 'Test', 'customerPhone' => '01900000000', 'paymentMethod' => 'cash',
        'items' => [['productName' => 'Mouse', 'quantity' => 1, 'unitPrice' => 500]],
    ])['json']['warranty'];
    eq($new['memo']['seller']['address'], 'Somewhere else, Dhaka', 'new memos use the new settings');
    status($admin->delete("/api/admin/warranties/{$new['id']}", ['confirmCode' => $new['code']]), 200);
    status($admin->put('/api/admin/settings', ['memoAddress' => 'Mariam Mart, Kunjaban Road, Rampura, Dhaka']), 200);
});

test('find a memo by phone (any format), serial, memo number or code', function () use ($admin, &$ids) {
    $old = $ids['w_old'];
    foreach (['karim', '01712345678', '8801712345678', '+880 1712 345678', '1712-345', 'RAM-B', 'gpu-sn-1', $old['invoiceNo'], strtolower($old['code'])] as $q) {
        $r = $admin->get('/api/admin/warranties?q=' . rawurlencode($q))['json'];
        ok($r['total'] === 1 && $r['items'][0]['id'] === $old['id'], "search '$q'");
    }
    eq($admin->get('/api/admin/warranties?q=01812345678')['json']['items'][0]['id'], $ids['w_active']['id'], 'other customer');
    $counts = $admin->get('/api/admin/warranties')['json']['counts'];
    eq([$counts['total'], $counts['active'], $counts['expired'], $counts['void']], [2, 2, 0, 0]);
});

test('deleting a warranty needs its code typed in', function () use ($admin, $guest, &$ids) {
    $w = $ids['w_active'];
    status($admin->delete("/api/admin/warranties/{$w['id']}", ['confirmCode' => 'HBW-WRNG-CODE']), 422, 'wrong code');
    status($admin->delete("/api/admin/warranties/{$w['id']}", ['confirmCode' => strtolower($w['code'])]), 200, 'right code');
    status($guest->get('/api/warranty/' . $w['code']), 404, 'gone');
});

test('warranty lookups are rate limited', function () use ($base) {
    $c = new Client($base);
    $last = null;
    for ($i = 0; $i < 41; $i++) {
        $last = $c->get('/api/warranty/HBW-ZZZZ-' . str_pad((string) $i, 4, 'X'));
    }
    status($last, 429);
});

// ------------------------------------------------------------------ settings, dashboard, activity

echo "\nSettings and dashboard\n";

test('settings are validated and cleaned', function () use ($admin, $guest) {
    $r = $admin->put('/api/admin/settings', ['whatsappNumber' => 'abc', 'facebookUrl' => 'javascript:alert(1)']);
    status($r, 422);
    ok(isset($r['json']['errors']['whatsappNumber'], $r['json']['errors']['facebookUrl']), 'both errors');
    $r = $admin->put('/api/admin/settings', ['whatsappNumberCn' => '']);
    status($r, 422, 'Admin (CN) number is required');
    ok(isset($r['json']['errors']['whatsappNumberCn']), 'CN error');
    status($admin->put('/api/admin/settings', ['whatsappNumber' => '', 'whatsappNumberCn' => '8613812345678']), 200, 'BD number is optional');
    $r = $admin->put('/api/admin/settings', [
        'whatsappNumber' => '017-1234 5678', 'facebookUrl' => 'facebook.com/hyperbyte.bd', 'heroPhrases' => "ONE\nTWO\n\n",
        'heroTitle' => '  UPGRADE   YOUR WORLD. ', 'siteName' => 'HyperByte',
    ]);
    status($r, 200);
    $s = $guest->get('/api/settings')['json']['settings'];
    eq($s['whatsappNumber'], '8801712345678');
    eq($s['facebookUrl'], 'https://facebook.com/hyperbyte.bd');
    eq($s['heroPhrases'], ['ONE', 'TWO']);
    eq($s['heroTitle'], 'UPGRADE YOUR WORLD.');
});

test('logo upload', function () use ($admin, $jpeg, $guest) {
    $r = $admin->post('/api/admin/settings/logo', null, ['multipart' => ['logo' => upload('logo', $jpeg, 'logo.jpg', 'image/jpeg')]]);
    status($r, 200);
    ok(str_starts_with($guest->get('/api/settings')['json']['settings']['logoUrl'], '/uploads/brand/'), 'logo url');
});

test('dashboard numbers', function () use ($admin) {
    $r = $admin->get('/api/admin/dashboard');
    status($r, 200);
    eq($r['json']['products']['total'], 6);
    eq($r['json']['warranties']['active'], 1);
    eq(array_column($r['json']['warnings'], 'key'), ['policy', 'setup'], 'policy draft and setup warnings remain');
    status($admin->put('/api/admin/settings', ['warrantyPolicyReviewed' => true]), 200);
    eq(array_column($admin->get('/api/admin/dashboard')['json']['warnings'], 'key'), ['setup'], 'policy warning gone after review');
});

test('activity log records admin changes', function () use ($admin) {
    $r = $admin->get('/api/admin/activity');
    status($r, 200);
    $actions = [];
    for ($page = 1; $page <= $r['json']['pages']; $page++) {
        $actions = array_merge($actions, array_column($admin->get("/api/admin/activity?page=$page")['json']['items'], 'action'));
    }
    foreach (['setup', 'login', 'product.create', 'warranty.void', 'settings.update'] as $a) {
        ok(in_array($a, $actions, true), "logged: $a");
    }
});

test('admin password change', function () use ($admin) {
    status($admin->put('/api/admin/account/password', ['currentPassword' => 'nope', 'newPassword' => 'new-pass-1234']), 422);
    status($admin->put('/api/admin/account/password', ['currentPassword' => 'correct-horse-42', 'newPassword' => 'weak']), 422);
    status($admin->put('/api/admin/account/password', ['currentPassword' => 'correct-horse-42', 'newPassword' => 'new-pass-1234']), 200);
});

// ------------------------------------------------------------------ sales ledger

echo "\nSales ledger\n";

test('ledger is admin-only and starts with the current month and rate 19.40', function () use ($admin, $guest) {
    status($guest->get('/api/admin/ledger'), 401);
    $v = $admin->get('/api/admin/ledger')['json'];
    eq($v['month']['ym'], (new DateTimeImmutable('now', new DateTimeZone('Asia/Dhaka')))->format('Y-m'), 'current month');
    eq($v['month']['status'], 'open');
    eq((float) $v['rate'], 19.4, 'default rate');
    eq($v['entries'], []);
    status($admin->put('/api/admin/ledger/rate', ['rate' => 'abc']), 422, 'bad rate');
    eq((float) $admin->put('/api/admin/ledger/rate', ['rate' => '19,50'])['json']['rate'], 19.5, 'comma rate');
    ok(!str_contains(json_encode($guest->get('/api/settings')['json']), 'ledgerRate'), 'rate is not public');
});

test('ledger entries: yuan and taka costs, profit only when sold', function () use ($admin, &$ids) {
    status($admin->post('/api/admin/ledger/entries', ['name' => '', 'costAmount' => 'x']), 422, 'validation');
    status($admin->post('/api/admin/ledger/entries', ['name' => 'RTX 3060', 'costAmount' => '2000', 'sold' => true]), 422, 'sold needs a selling price');
    $a = $admin->post('/api/admin/ledger/entries', ['name' => 'ROG G14', 'costAmount' => '2140', 'shipping' => '2900', 'extra' => '100', 'selling' => '60000', 'sold' => true])['json']['entry'];
    eq((float) $a['rate'], 19.5, 'uses the saved rate');
    eq((float) $a['costBdt'], 41730.0);
    eq((float) $a['totalCost'], 44730.0);
    eq((float) $a['profit'], 15270.0);
    $b = $admin->post('/api/admin/ledger/entries', ['name' => 'SN7100 1TB', 'costAmount' => '895', 'rate' => '18.75', 'shipping' => '2025', 'selling' => '18000', 'sold' => true])['json']['entry'];
    eq((float) $b['profit'], -806.25, 'loss is negative');
    $c = $admin->post('/api/admin/ledger/entries', ['name' => 'Lexar Thor 16GB', 'costCurrency' => 'BDT', 'costAmount' => '1,8000', 'selling' => '20000'])['json']['entry'];
    eq((float) $c['totalCost'], 18000.0, 'taka cost');
    eq($c['rate'], null);
    eq($c['profit'], null, 'unsold has no profit');
    status($admin->put('/api/admin/ledger/rate', ['rate' => '20']), 200);
    $v = $admin->get('/api/admin/ledger')['json'];
    eq((float) $v['entries'][0]['totalCost'], 44730.0, 'old entries keep their rate');
    eq((float) $v['summary']['profit'], 14463.75, 'profit counts sold only');
    eq((float) $v['summary']['turnover'], 78000.0);
    eq($v['summary']['unsoldCount'], 1);
    eq((float) $v['summary']['unsoldCost'], 18000.0);
    eq((float) $admin->get('/api/admin/dashboard')['json']['ledger']['profit'], 14463.75, 'dashboard');
    $ids['ledger_unsold'] = $c['id'];
    $ids['ledger_sold'] = $a['id'];
});

test('closing a month keeps sold items and moves unsold ones', function () use ($admin, &$ids) {
    $ym = $admin->get('/api/admin/ledger')['json']['month']['ym'];
    status($admin->put("/api/admin/ledger/months/$ym/note", ['note' => 'total 20k paid']), 200);
    status($admin->post('/api/admin/ledger/close', ['month' => '1999-01']), 409, 'only the open month');
    $r = $admin->post('/api/admin/ledger/close', ['month' => $ym])['json'];
    eq($r['moved'], 1);
    $next = (new DateTimeImmutable($ym . '-01'))->modify('+1 month')->format('Y-m');
    eq($r['open'], $next);
    status($admin->post('/api/admin/ledger/close', ['month' => $ym]), 409, 'no double close');
    $old = $admin->get("/api/admin/ledger?month=$ym")['json'];
    eq($old['month']['status'], 'closed');
    eq(count($old['entries']), 2, 'sold stay');
    eq($old['month']['note'], 'total 20k paid');
    $new = $admin->get('/api/admin/ledger')['json'];
    eq($new['month']['ym'], $next);
    eq(count($new['entries']), 1);
    eq($new['entries'][0]['firstYm'], $ym, 'remembers where it started');
    status($admin->put('/api/admin/ledger/entries/' . $ids['ledger_sold'], ['name' => 'x', 'costAmount' => '1']), 409, 'closed month is read-only');
    status($admin->delete('/api/admin/ledger/entries/' . $ids['ledger_sold']), 409);
    $e = $admin->put('/api/admin/ledger/entries/' . $ids['ledger_unsold'], ['name' => 'Lexar Thor 16GB', 'costCurrency' => 'BDT', 'costAmount' => '18000', 'selling' => '20000', 'sold' => true])['json']['entry'];
    eq((float) $e['profit'], 2000.0, 'sold next month');
    status($admin->delete('/api/admin/ledger/entries/' . $ids['ledger_unsold']), 200);
    status($admin->get('/api/admin/ledger?month=2001-01'), 404);
});

// ------------------------------------------------------------------ website pages (SEO)

echo "\nWebsite pages\n";

test('product pages get their own title and preview tags', function () use ($guest, &$ids) {
    $r = $guest->get('/product/' . $ids['gpu']['slug']);
    status($r, 200);
    ok(str_contains($r['text'], '<title>MSI RTX 3060 Ventus 2X 12GB | HyperByte</title>'), 'title');
    ok(str_contains($r['text'], 'og:image" content="http://127.0.0.1'), 'absolute og:image');
    ok(str_contains($r['text'], 'Product ID HB-1001'), 'description');
    status($guest->get('/product/' . $ids['hidden']['slug']), 404, 'unpublished product page');
    status($guest->get('/no-such-page'), 404, 'unknown page');
    status($guest->get('/products'), 200);
    ok(str_contains($guest->get('/admin')['text'], 'noindex'), 'admin not indexed');
});

test('robots.txt and sitemap.xml', function () use ($guest, &$ids) {
    ok(str_contains($guest->get('/robots.txt')['text'], 'Sitemap: http://127.0.0.1'), 'robots');
    $map = $guest->get('/sitemap.xml')['text'];
    ok(str_contains($map, '/product/' . $ids['gpu']['slug']), 'product in sitemap');
    ok(!str_contains($map, $ids['hidden']['slug']), 'unpublished not in sitemap');
});

test('deleting a product removes it and its photos', function () use ($admin, $guest, &$ids, $tmp) {
    $p = $admin->get('/api/admin/products/' . $ids['gpu']['dbId'])['json']['product'];
    $file = $tmp . '/uploads' . substr($p['images'][0]['url'], strlen('/uploads'));
    status($admin->delete('/api/admin/products/' . $p['dbId']), 200);
    status($guest->get('/api/products/' . $p['slug']), 404);
    ok(!is_file($file), 'photo file deleted');
    status($admin->delete("/api/admin/categories/{$ids['cat_gpu']}"), 409, 'category still has products');
    status($admin->delete("/api/admin/categories/{$ids['cat_cases']}"), 200, 'empty category deleted');
});

// ------------------------------------------------------------------ summary

$total = $passed + count($failed);
echo "\n" . ($failed ? "\033[31m" : "\033[32m") . "$passed of $total tests passed\033[0m\n";
if ($failed) {
    $log = array_filter(explode("\n", (string) @file_get_contents($tmp . '/server.log')), static fn ($l) => !preg_match('/ (Accepted|Closing)$|\[(200|201|204|401|403|404|409|422|429)\]: /', $l));
    if ($log) {
        echo "Server messages:\n" . implode("\n", array_slice($log, -30)) . "\n";
    }
}
exit($failed ? 1 : 0);
