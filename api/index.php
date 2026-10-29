<?php
// hyperByte API. Every request to /api/... is sent here by api/.htaccess
// (or by dev-router.php when running locally).
declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

$router = new Router();
$req = new Request();

// Wraps a handler so it only runs for a logged-in admin.
$admin = static fn (callable $handler) => static function (Request $r) use ($handler) {
    return $handler($r, Auth::requireAdmin($r));
};
$id = static fn (Request $r, string $key = 'id'): int => Util::int($r->params[$key] ?? null, 0) ?? 0;

// A bcrypt hash of a random string; used so unknown emails take as long as wrong passwords.
const HB_DUMMY_HASH = '$2y$10$q2xDq3jOAeuUwI5ygjrGDeSy3egDcHC5WFrCfyTkdd/m31g5qynA.';

function hb_admin_shape(array $a): array
{
    return ['id' => (int) $a['id'], 'name' => $a['name'], 'email' => $a['email']];
}

// ------------------------------------------------------------------ public

$router->get('/health', static fn () => [
    'ok' => true,
    'database' => (static function () {
        try {
            Db::value('SELECT 1');
            return Migrator::isInstalled() ? 'ready' : 'not installed';
        } catch (Throwable) {
            return 'not connected';
        }
    })(),
]);

$router->get('/settings', static fn () => ['settings' => Settings::publicValues()]);

$router->get('/categories', static fn () => ['categories' => Catalog::publicCategories()]);

$router->get('/home', static fn () => Catalog::home());

$router->get('/products', static fn (Request $r) => Catalog::listPublic($r->query));

$router->get('/products/{slug}', static function (Request $r) {
    $result = Catalog::publicProduct(Util::line($r->params['slug'], 140));
    if (!$result) {
        throw new HttpError(404, 'This product is not available.');
    }
    return $result;
});

$router->get('/warranty/{code}', static function (Request $r) {
    RateLimiter::hit('warranty:' . Util::clientIp(), 40, 600, 'Too many warranty checks from your connection.');
    $code = Warranty::normalizeCode($r->params['code']);
    $found = $code !== '' ? Warranty::lookup($code) : null;
    if (!$found) {
        Response::json([
            'found' => false,
            'status' => 'not_registered',
            'message' => 'No warranty is registered with this code. Check the code on your receipt and try again.',
            'serverTime' => gmdate('Y-m-d\TH:i:s\Z'),
        ], 404);
    }
    return $found;
});

// ------------------------------------------------------------------ admin: setup and login

$router->get('/admin/status', static function () {
    $installed = false;
    $hasAdmin = false;
    $connected = true;
    try {
        $installed = Migrator::isInstalled();
        $hasAdmin = $installed && (int) Db::value('SELECT COUNT(*) FROM admins') > 0;
    } catch (Throwable) {
        $connected = false;
    }
    $token = (string) Env::get('SETUP_TOKEN', '');
    return [
        'databaseConnected' => $connected,
        'installed' => $installed,
        'hasAdmin' => $hasAdmin,
        'setupAvailable' => !$hasAdmin && strlen($token) >= 16,
    ];
});

$router->post('/admin/setup', static function (Request $r) {
    $token = (string) Env::get('SETUP_TOKEN', '');
    if (strlen($token) < 16) {
        throw new HttpError(403, 'Setup is turned off. Add a SETUP_TOKEN (at least 16 characters) to api/.env first.');
    }
    if (Migrator::isInstalled()) {
        RateLimiter::hit('setup:' . Util::clientIp(), 10, 3600, 'Too many setup attempts.');
    }
    if (!hash_equals($token, (string) $r->input('token', ''))) {
        throw HttpError::validation(['token' => 'This setup token is not correct.'], 'The setup token is not correct.');
    }
    Migrator::migrate();
    if ((int) Db::value('SELECT COUNT(*) FROM admins') > 0) {
        throw new HttpError(409, 'An admin account already exists. Log in instead.');
    }
    $name = Util::line($r->input('name', ''), 80);
    $email = strtolower(Util::line($r->input('email', ''), 160));
    $password = is_string($r->input('password')) ? $r->input('password') : '';
    $errors = [];
    if (mb_strlen($name) < 2) {
        $errors['name'] = 'Enter your name.';
    }
    if (!Util::isEmail($email)) {
        $errors['email'] = 'Enter a valid email address.';
    }
    if ($problem = Auth::passwordProblem($password)) {
        $errors['password'] = $problem;
    }
    if ($errors) {
        throw HttpError::validation($errors);
    }
    $now = Db::now();
    $adminId = Db::insert('admins', [
        'name' => $name,
        'email' => $email,
        'password_hash' => Auth::hashPassword($password),
        'is_active' => 1,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    $row = Db::one('SELECT * FROM admins WHERE id = ?', [$adminId]);
    Auth::login($row);
    ActivityLog::add($row, 'setup', 'admin', $adminId, 'Created the first admin account');
    return ['admin' => hb_admin_shape($row), 'csrf' => Auth::csrf()];
});

$router->post('/admin/login', static function (Request $r) {
    $email = strtolower(Util::line($r->input('email', ''), 160));
    $password = is_string($r->input('password')) ? $r->input('password') : '';
    if ($email === '' || $password === '') {
        throw HttpError::validation(['email' => $email === '' ? 'Enter your email.' : null, 'password' => $password === '' ? 'Enter your password.' : null]);
    }
    $ip = Util::clientIp();
    RateLimiter::hit("login-ip:$ip", 20, 900, 'Too many login attempts.');
    $accountBucket = 'login-acct:' . hash('sha256', $email);
    RateLimiter::hit($accountBucket, 6, 900, 'Too many failed logins for this account.');

    $row = Db::one('SELECT * FROM admins WHERE email = ?', [$email]);
    $valid = password_verify($password, $row['password_hash'] ?? HB_DUMMY_HASH);
    if (!$row || !$valid || !(int) $row['is_active']) {
        throw new HttpError(401, 'Wrong email or password.');
    }
    RateLimiter::clear($accountBucket);
    if (password_needs_rehash($row['password_hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        Db::update('admins', ['password_hash' => Auth::hashPassword($password)], 'id = ?', [$row['id']]);
    }
    Migrator::migrate();
    Auth::login($row);
    ActivityLog::add($row, 'login', 'admin', (int) $row['id'], 'Logged in');
    return ['admin' => hb_admin_shape($row), 'csrf' => Auth::csrf()];
});

$router->post('/admin/logout', static function () {
    Auth::logout();
    return ['ok' => true];
});

$router->get('/admin/me', static function () {
    $a = Auth::admin();
    if (!$a) {
        throw new HttpError(401, 'Please log in to the admin panel.');
    }
    return ['admin' => hb_admin_shape($a), 'csrf' => Auth::csrf()];
});

$router->put('/admin/account/password', $admin(static function (Request $r, array $a) {
    $current = (string) $r->input('currentPassword', '');
    $next = (string) $r->input('newPassword', '');
    $row = Db::one('SELECT * FROM admins WHERE id = ?', [$a['id']]);
    if (!password_verify($current, $row['password_hash'])) {
        throw HttpError::validation(['currentPassword' => 'Your current password is not correct.']);
    }
    if ($problem = Auth::passwordProblem($next)) {
        throw HttpError::validation(['newPassword' => $problem]);
    }
    Db::update('admins', ['password_hash' => Auth::hashPassword($next), 'updated_at' => Db::now()], 'id = ?', [$a['id']]);
    ActivityLog::add($a, 'password', 'admin', (int) $a['id'], 'Changed the admin password');
    return ['ok' => true];
}));

// ------------------------------------------------------------------ admin: dashboard

$router->get('/admin/dashboard', $admin(static function () {
    // Housekeeping: delete archived photos of sold products that are past the retention period.
    try {
        Catalog::purgeArchive();
    } catch (Throwable $e) {
        error_log('Archive cleanup failed: ' . $e->getMessage());
    }
    $productCounts = Catalog::adminList(['limit' => 1])['counts'];
    $recent = Catalog::adminList(['sort' => 'updated', 'limit' => 6])['items'];
    $expiring = Warranty::adminList(['view' => 'expiring', 'limit' => 6])['items'];
    $settings = Settings::all();
    $warnings = [];
    if ($settings['whatsappNumberCn'] === '') {
        $warnings[] = ['key' => 'whatsapp', 'text' => 'Add the WhatsApp number of Admin (CN) in Settings. Until a WhatsApp number is set, the WhatsApp buttons stay hidden.'];
    }
    if ($settings['facebookUrl'] === '') {
        $warnings[] = ['key' => 'facebook', 'text' => 'Add your Facebook Page link in Settings so customers can reach you there.'];
    }
    if (!$settings['warrantyPolicyReviewed']) {
        $warnings[] = ['key' => 'policy', 'text' => 'The Warranty Policy page still shows the draft text. Read it in Settings, change it to match your real policy, and mark it as reviewed.'];
    }
    if (Env::get('SETUP_TOKEN')) {
        $warnings[] = ['key' => 'setup', 'text' => 'Setup is finished. Remove SETUP_TOKEN from api/.env for extra safety.'];
    }
    return [
        'products' => $productCounts,
        'warranties' => Warranty::counts(),
        'inquiries' => Inquiry::counts(),
        'ledger' => Ledger::openSummary(),
        'recentProducts' => $recent,
        'expiringWarranties' => $expiring,
        'warnings' => $warnings,
    ];
}));

// ------------------------------------------------------------------ admin: products

$router->get('/admin/products', $admin(static fn (Request $r) => Catalog::adminList($r->query)));

$router->post('/admin/products', $admin(static function (Request $r, array $a) {
    $product = Catalog::save(null, $r->body());
    ActivityLog::add($a, 'product.create', 'product', $product['dbId'], "Added {$product['name']} ({$product['sku']})");
    Response::json(['product' => $product], 201);
}));

$router->get('/admin/products/{id}', $admin(static fn (Request $r) => ['product' => Catalog::adminProduct($id($r))]));

$router->put('/admin/products/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $product = Catalog::save($id($r), $r->body());
    ActivityLog::add($a, 'product.update', 'product', $product['dbId'], "Edited {$product['name']} ({$product['sku']})");
    return ['product' => $product];
}));

$router->patch('/admin/products/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $product = Catalog::quickUpdate($id($r), $r->body());
    $changes = [];
    foreach (['status', 'isPublished', 'isFeatured'] as $key) {
        if (array_key_exists($key, $r->body())) {
            $changes[] = $key === 'status' ? 'status ' . $product['status']
                : ($key === 'isPublished' ? ($product['isPublished'] ? 'published' : 'unpublished')
                    : ($product['isFeatured'] ? 'featured' : 'not featured'));
        }
    }
    ActivityLog::add($a, 'product.update', 'product', $product['dbId'], "{$product['name']}: " . implode(', ', $changes));
    return ['product' => $product];
}));

$router->delete('/admin/products/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $row = Catalog::delete($id($r));
    ActivityLog::add($a, 'product.delete', 'product', (int) $row['id'], "Deleted {$row['name']} ({$row['sku']})");
    return ['ok' => true];
}));

$router->post('/admin/products/{id}/images', $admin(static function (Request $r, array $a) use ($id) {
    Images::assertRequestFits();
    $product = Catalog::addImages($id($r), $r->files('images'));
    ActivityLog::add($a, 'product.photos', 'product', $product['dbId'], "Uploaded photos for {$product['name']}");
    return ['product' => $product];
}));

$router->delete('/admin/products/{id}/images/{imageId}', $admin(static function (Request $r, array $a) use ($id) {
    $product = Catalog::deleteImage($id($r), $id($r, 'imageId'));
    ActivityLog::add($a, 'product.photos', 'product', $product['dbId'], "Removed a photo from {$product['name']}");
    return ['product' => $product];
}));

$router->put('/admin/products/{id}/images/order', $admin(static function (Request $r) use ($id) {
    $ids = $r->input('ids', []);
    return ['product' => Catalog::reorderImages($id($r), is_array($ids) ? $ids : [])];
}));

$router->post('/admin/products/{id}/images/restore', $admin(static function (Request $r, array $a) use ($id) {
    $count = Catalog::restoreArchivedPhotos($id($r));
    $product = Catalog::adminProduct($id($r));
    ActivityLog::add($a, 'product.photos', 'product', $product['dbId'], "Restored $count archived photo" . ($count === 1 ? '' : 's') . " of {$product['name']}");
    return ['product' => $product, 'restored' => $count];
}));

// Lets the admin see an unpublished product exactly as customers would.
$router->get('/admin/preview/{slug}', $admin(static function (Request $r) {
    $row = Db::one('SELECT id FROM products WHERE slug = ?', [Util::line($r->params['slug'], 140)]);
    if (!$row) {
        throw new HttpError(404, 'Product not found.');
    }
    $product = Catalog::adminProduct((int) $row['id']);
    return ['product' => $product, 'related' => [], 'preview' => true];
}));

// ------------------------------------------------------------------ admin: categories

$router->get('/admin/categories', $admin(static fn () => ['categories' => Catalog::adminCategories()]));

$router->post('/admin/categories', $admin(static function (Request $r, array $a) {
    $category = Catalog::saveCategory(null, $r->body());
    ActivityLog::add($a, 'category.create', 'category', $category['id'], "Added category {$category['name']}");
    Response::json(['category' => $category], 201);
}));

$router->put('/admin/categories/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $category = Catalog::saveCategory($id($r), $r->body());
    ActivityLog::add($a, 'category.update', 'category', $category['id'], "Edited category {$category['name']}");
    return ['category' => $category];
}));

$router->delete('/admin/categories/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $row = Catalog::deleteCategory($id($r));
    ActivityLog::add($a, 'category.delete', 'category', (int) $row['id'], "Deleted category {$row['name']}");
    return ['ok' => true];
}));

// ------------------------------------------------------------------ admin: warranties

$router->get('/admin/warranties', $admin(static fn (Request $r) => Warranty::adminList($r->query)));

$router->post('/admin/warranties', $admin(static function (Request $r, array $a) {
    $w = Warranty::save(null, $r->body());
    ActivityLog::add($a, 'warranty.create', 'warranty', $w['id'], "Created memo {$w['invoiceNo']} with warranty {$w['code']} ({$w['productName']})");
    Response::json(['warranty' => $w], 201);
}));

$router->get('/admin/warranties/{id}', $admin(static fn (Request $r) => ['warranty' => Warranty::adminView(Warranty::find($id($r)))]));

$router->put('/admin/warranties/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $w = Warranty::save($id($r), $r->body());
    ActivityLog::add($a, 'warranty.update', 'warranty', $w['id'], "Edited warranty {$w['code']}");
    return ['warranty' => $w];
}));

$router->post('/admin/warranties/{id}/extend', $admin(static function (Request $r, array $a) use ($id) {
    $w = Warranty::extend($id($r), $r->body());
    ActivityLog::add($a, 'warranty.extend', 'warranty', $w['id'], "Extended warranty {$w['code']}");
    return ['warranty' => $w];
}));

$router->post('/admin/warranties/{id}/void', $admin(static function (Request $r, array $a) use ($id) {
    $itemId = Util::int($r->input('itemId', null));
    $w = Warranty::setVoid($id($r), true, (string) $r->input('reason', ''), $itemId);
    ActivityLog::add($a, 'warranty.void', 'warranty', $w['id'], ($itemId ? 'Voided one product on' : 'Voided') . " warranty {$w['code']}");
    return ['warranty' => $w];
}));

$router->post('/admin/warranties/{id}/restore', $admin(static function (Request $r, array $a) use ($id) {
    $itemId = Util::int($r->input('itemId', null));
    $w = Warranty::setVoid($id($r), false, '', $itemId);
    ActivityLog::add($a, 'warranty.restore', 'warranty', $w['id'], ($itemId ? 'Restored one product on' : 'Restored') . " warranty {$w['code']}");
    return ['warranty' => $w];
}));

$router->delete('/admin/warranties/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $row = Warranty::delete($id($r), (string) $r->input('confirmCode', ''));
    ActivityLog::add($a, 'warranty.delete', 'warranty', (int) $row['id'], "Deleted warranty {$row['code']} ({$row['product_name']})");
    return ['ok' => true];
}));

// ------------------------------------------------------------------ admin: pre-order and sourcing inquiries

$router->get('/admin/inquiries', $admin(static fn (Request $r) => Inquiry::list($r->query)));

$router->post('/admin/inquiries', $admin(static function (Request $r, array $a) {
    $item = Inquiry::save(null, $r->body());
    ActivityLog::add($a, 'inquiry.create', 'inquiry', $item['id'], "Added inquiry {$item['ref']} for {$item['productName']}");
    Response::json(['inquiry' => $item], 201);
}));

$router->get('/admin/inquiries/{id}', $admin(static fn (Request $r) => ['inquiry' => Inquiry::shape(Inquiry::find($id($r)))]));

$router->put('/admin/inquiries/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $item = Inquiry::save($id($r), $r->body());
    ActivityLog::add($a, 'inquiry.update', 'inquiry', $item['id'], "Updated inquiry {$item['ref']} ({$item['status']})");
    return ['inquiry' => $item];
}));

$router->delete('/admin/inquiries/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $row = Inquiry::delete($id($r));
    ActivityLog::add($a, 'inquiry.delete', 'inquiry', (int) $row['id'], "Deleted inquiry {$row['ref']}");
    return ['ok' => true];
}));

// ------------------------------------------------------------------ admin: sales ledger (private)

$router->get('/admin/ledger', $admin(static fn (Request $r) => Ledger::view(Util::line($r->query['month'] ?? '', 7))));

$router->put('/admin/ledger/rate', $admin(static function (Request $r, array $a) {
    $rate = Ledger::setRate($r->body()['rate'] ?? null);
    ActivityLog::add($a, 'ledger.rate', 'ledger', null, "Set the yuan rate to 1 CNY = $rate BDT");
    return ['rate' => $rate];
}));

$router->post('/admin/ledger/entries', $admin(static function (Request $r, array $a) {
    $item = Ledger::save(null, $r->body());
    ActivityLog::add($a, 'ledger.create', 'ledger', $item['id'], "Added ledger entry {$item['name']}");
    Response::json(['entry' => $item], 201);
}));

$router->put('/admin/ledger/entries/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $item = Ledger::save($id($r), $r->body());
    ActivityLog::add($a, 'ledger.update', 'ledger', $item['id'], "Updated ledger entry {$item['name']}" . ($item['sold'] ? ' (sold)' : ''));
    return ['entry' => $item];
}));

$router->delete('/admin/ledger/entries/{id}', $admin(static function (Request $r, array $a) use ($id) {
    $row = Ledger::delete($id($r));
    ActivityLog::add($a, 'ledger.delete', 'ledger', (int) $row['id'], "Deleted ledger entry {$row['name']}");
    return ['ok' => true];
}));

$router->put('/admin/ledger/months/{ym}/note', $admin(static function (Request $r) {
    return ['month' => Ledger::saveNote((string) ($r->params['ym'] ?? ''), $r->body()['note'] ?? '')];
}));

$router->post('/admin/ledger/close', $admin(static function (Request $r, array $a) {
    $result = Ledger::closeMonth(Util::line($r->body()['month'] ?? '', 7));
    ActivityLog::add($a, 'ledger.close', 'ledger', null, "Closed {$result['closed']}; moved {$result['moved']} unsold item(s) to {$result['open']}");
    return $result;
}));

// ------------------------------------------------------------------ admin: settings and activity

$router->get('/admin/settings', $admin(static fn () => ['settings' => Settings::all()]));

$router->put('/admin/settings', $admin(static function (Request $r, array $a) {
    $settings = Settings::update($r->body());
    ActivityLog::add($a, 'settings.update', 'settings', null, 'Updated site settings');
    return ['settings' => $settings];
}));

$router->post('/admin/settings/logo', $admin(static function (Request $r, array $a) {
    Images::assertRequestFits();
    $files = $r->files('logo');
    if (!$files) {
        throw new HttpError(422, 'Choose a logo image.');
    }
    $saved = Images::store($files[0], 'brand');
    $old = (string) Settings::get('logoUrl');
    Settings::set('logoUrl', $saved['path']);
    if ($saved['thumb'] !== $saved['path']) {
        Images::delete($saved['thumb']);
    }
    Images::delete($old);
    ActivityLog::add($a, 'settings.logo', 'settings', null, 'Changed the logo');
    return ['settings' => Settings::all()];
}));

$router->delete('/admin/settings/logo', $admin(static function (Request $r, array $a) {
    Images::delete((string) Settings::get('logoUrl'));
    Settings::set('logoUrl', '');
    ActivityLog::add($a, 'settings.logo', 'settings', null, 'Removed the logo');
    return ['settings' => Settings::all()];
}));

$router->get('/admin/activity', $admin(static function (Request $r) {
    $limit = 50;
    $page = max(1, Util::int($r->q('page'), 1) ?? 1);
    $offset = ($page - 1) * $limit;
    $total = (int) Db::value('SELECT COUNT(*) FROM activity_log');
    $rows = Db::all("SELECT * FROM activity_log ORDER BY id DESC LIMIT $limit OFFSET $offset");
    return [
        'items' => array_map(static fn ($row) => [
            'id' => (int) $row['id'],
            'adminName' => $row['admin_name'],
            'action' => $row['action'],
            'entity' => $row['entity'],
            'entityId' => $row['entity_id'] === null ? null : (int) $row['entity_id'],
            'summary' => $row['summary'],
            'ip' => $row['ip'],
            'createdAt' => Util::iso($row['created_at']),
        ], $rows),
        'total' => $total,
        'page' => $page,
        'pages' => (int) ceil($total / $limit),
    ];
}));

// ------------------------------------------------------------------ run

try {
    try {
        Migrator::ensureCurrent();
    } catch (PDOException) {
        // No database yet: the setup page explains what to do.
    }
    if ($req->method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    $router->dispatch($req);
} catch (HttpError $e) {
    $extra = $e->extra;
    if (isset($extra['errors'])) {
        $extra['errors'] = array_filter($extra['errors'], static fn ($v) => $v !== null);
    }
    Response::json(['message' => $e->getMessage()] + $extra, $e->status);
} catch (PDOException $e) {
    error_log('[hyperByte] Database error: ' . $e->getMessage());
    $notInstalled = str_contains($e->getMessage(), 'no such table') || str_contains($e->getMessage(), "doesn't exist") || str_contains($e->getMessage(), 'Base table or view not found');
    $connection = str_contains($e->getMessage(), 'SQLSTATE[HY000] [') || str_contains($e->getMessage(), 'could not find driver');
    $message = $notInstalled
        ? 'The database is not set up yet. Open /admin/setup to install it.'
        : ($connection ? 'Cannot connect to the database. Check the DB_ settings in api/.env.' : 'A database error happened. Please try again.');
    $body = ['message' => $message];
    if (Env::bool('APP_DEBUG')) {
        $body['debug'] = $e->getMessage();
    }
    Response::json($body, $notInstalled || $connection ? 503 : 500);
} catch (Throwable $e) {
    error_log('[hyperByte] ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    $body = ['message' => 'Something went wrong on the server. Please try again.'];
    if (Env::bool('APP_DEBUG')) {
        $body['debug'] = $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')';
    }
    Response::json($body, 500);
}
