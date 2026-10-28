<?php
// Sets a new password for an admin (use this if you forget it). Run:
//   php api/cli/reset-password.php you@example.com
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('Run this from the command line.');
}
require dirname(__DIR__) . '/src/bootstrap.php';

$email = strtolower(trim($argv[1] ?? ''));
if ($email === '') {
    fwrite(STDERR, "Usage: php api/cli/reset-password.php you@example.com\n");
    exit(1);
}
$admin = Db::one('SELECT id FROM admins WHERE email = ?', [$email]);
if (!$admin) {
    fwrite(STDERR, "No admin uses $email.\n");
    exit(1);
}
echo 'New password (at least 10 characters, letters and numbers): ';
$password = trim((string) fgets(STDIN));
if ($problem = Auth::passwordProblem($password)) {
    fwrite(STDERR, $problem . "\n");
    exit(1);
}
Db::update('admins', ['password_hash' => Auth::hashPassword($password), 'is_active' => 1, 'updated_at' => Db::now()], 'id = ?', [$admin['id']]);
Db::run('DELETE FROM rate_limits WHERE bucket LIKE ?', ['login-%']);
echo "Password changed for $email.\n";
