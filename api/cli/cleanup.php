<?php
// Deletes archived photos of sold products that are older than the retention
// period set in Admin > Settings. The admin dashboard also does this, so a cron
// job is optional. cPanel > Cron Jobs, once a day:
//   php /home/USER/public_html/api/cli/cleanup.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('Run this from the command line.');
}
require dirname(__DIR__) . '/src/bootstrap.php';

try {
    Migrator::ensureCurrent();
    $deleted = Catalog::purgeArchive();
    echo "Deleted $deleted archived photo" . ($deleted === 1 ? '' : 's') . ".\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Cleanup failed: ' . $e->getMessage() . "\n");
    exit(1);
}
