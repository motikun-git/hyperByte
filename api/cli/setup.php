<?php
// Creates or updates the database tables and, if there is no admin yet,
// asks for the first admin account. Run from the hyperByte folder:
//   php api/cli/setup.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit('Run this from the command line.');
}
require dirname(__DIR__) . '/src/bootstrap.php';

function ask(string $question): string
{
    echo $question;
    $line = fgets(STDIN);
    return $line === false ? '' : trim($line);
}

try {
    echo 'Database: ' . Db::driver() . (Db::driver() === 'mysql' ? ' (' . Env::get('DB_NAME', '?') . ' on ' . Env::get('DB_HOST', 'localhost') . ')' : '') . "\n";
    $applied = Migrator::migrate();
    echo $applied ? 'Database updated: ' . implode(', ', $applied) . "\n" : "Database is already up to date.\n";

    if ((int) Db::value('SELECT COUNT(*) FROM admins') > 0) {
        echo "An admin account already exists. Log in at /admin.\n";
        exit(0);
    }

    echo "\nCreate the first admin account.\n";
    $name = ask('Your name: ');
    $email = strtolower(ask('Email: '));
    $password = ask('Password (at least 10 characters, letters and numbers): ');

    if (mb_strlen($name) < 2 || !Util::isEmail($email)) {
        fwrite(STDERR, "Please enter a name and a valid email.\n");
        exit(1);
    }
    if ($problem = Auth::passwordProblem($password)) {
        fwrite(STDERR, $problem . "\n");
        exit(1);
    }
    $now = Db::now();
    Db::insert('admins', [
        'name' => $name,
        'email' => $email,
        'password_hash' => Auth::hashPassword($password),
        'is_active' => 1,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    echo "\nDone. Log in at /admin with $email\n";
} catch (Throwable $e) {
    fwrite(STDERR, "\nSetup failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Check the DB_ values in api/.env and that MySQL is running (XAMPP Control Panel > MySQL > Start).\n");
    exit(1);
}
