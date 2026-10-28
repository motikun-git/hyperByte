# HyperByte website

Product showcase and inquiry website for HyperByte (second-hand PC parts and laptops, Khilgaon, Dhaka).
Customers browse products and ask on WhatsApp or Facebook. There is no cart, checkout or online payment.

- **Website**: home (featured GPUs, recently added, available, pre-order, categories, custom PC build), products with
  search and filters (category, subcategory, availability, condition, price), product pages with photo gallery,
  "Copy product details", warranty check, warranty policy, pre-order information, custom PC build inquiry, about, contact.
- **Admin panel** at `/admin`: products (up to 10 photos each), categories and subcategories, warranties,
  pre-order / sourcing requests, settings and page texts, activity log. Works on a phone too.
- **Stack**: React 19 + Vite (website), PHP 8.1+ with MySQL (API). Works on normal cPanel shared hosting.

> **সংক্ষেপে (বাংলা):** PC-তে চালাতে XAMPP (PHP + MySQL) আর Node.js লাগবে। নিচের "Run it on your PC" ধাপগুলো একে একে করুন।
> Hosting-এ তুলতে `npm.cmd run deploy` চালিয়ে `deploy/public_html` ফোল্ডারটা cPanel-এর `public_html`-এ আপলোড করুন, তারপর `api/.env` বানিয়ে `/admin` এ গিয়ে প্রথম admin account তৈরি করুন।

---

## Folders

| Folder | What it is |
| --- | --- |
| `client/` | The React website and admin panel (source code). `npm run build` makes `client/dist/`. |
| `api/` | The PHP API: products, photos, warranties, login, settings. |
| `api/.env.example` | Settings template. Copy to `api/.env` and fill in. Never upload `.env` to GitHub. |
| `api/migrations/` | Database tables. They are created automatically. |
| `api/cli/` | Command-line tools: first setup, password reset. |
| `api/tests/run.php` | Automatic tests for the API. |
| `site/` | Files for the live server: `index.php` (page titles, previews, sitemap) and `.htaccess` rules. |
| `scripts/make-deploy.mjs` | Builds the upload folder `deploy/public_html`. |
| `dev-router.php` | Lets PHP's built-in server run the API on your PC. |

---

## Run it on your PC (Windows)

### 1. Install the tools (once)

1. **XAMPP** (PHP 8.1 or newer + MySQL): https://www.apachefriends.org. Open the XAMPP Control Panel and **Start MySQL**.
2. **Node.js LTS**: https://nodejs.org
3. Check in PowerShell:
   ```powershell
   php -v          # if "not recognized", use C:\xampp\php\php.exe instead of php
   node -v
   ```
   Tip: add `C:\xampp\php` to your Windows PATH so `php` works everywhere.
4. In `C:\xampp\php\php.ini`, make sure these lines do **not** start with `;` (then restart XAMPP):
   ```ini
   extension=gd
   extension=pdo_mysql
   extension=fileinfo
   extension=intl
   extension=pdo_sqlite
   ```
   (`pdo_sqlite` is only needed for the automatic tests.)

### 2. Create the database

Open http://localhost/phpmyadmin, click **New**, name it `hyperbyte`, collation `utf8mb4_unicode_ci`, **Create**.
(The tables are created automatically later.)

### 3. Create `api/.env`

```powershell
cd C:\Users\ahasa\HyperByte
copy api\.env.example api\.env
notepad api\.env
```

For XAMPP the defaults usually work (`DB_USER=root`, empty `DB_PASS`). Set a long random `SETUP_TOKEN`,
for example from:

```powershell
php -r "echo bin2hex(random_bytes(24));"
```

### 4. Start the API and the website (two PowerShell windows)

Window 1, the API:

```powershell
cd C:\Users\ahasa\HyperByte
php -S localhost:8000 dev-router.php
```

Window 2, the website:

```powershell
cd C:\Users\ahasa\HyperByte\client
npm.cmd install
npm.cmd run dev
```

Open **http://localhost:5173**. The website talks to the API on port 8000 automatically.

### 5. Create the first admin account

Open **http://localhost:5173/admin**, enter the `SETUP_TOKEN` from `api/.env`, your name, email and a password
(10+ characters with letters and numbers). Or in a terminal: `php api/cli/setup.php`.
After that, remove `SETUP_TOKEN` from `api/.env`. There is no public sign-up page.

Forgot the password? `php api/cli/reset-password.php your@email.com`

### 6. First things to do in the admin panel

Your Facebook Page and Instagram links are already filled in. Add the WhatsApp number in **Settings**.

1. **Settings**: the Admin (CN) WhatsApp number (required, like `86XXXXXXXXXXX`), the Admin (BD) number (optional), Facebook Page link, phone, address, opening hours, logo.
   Until the WhatsApp number is set, the WhatsApp buttons stay hidden on purpose.
2. **Products > Add product**: name, category, condition, price (leave empty for "Contact for price"), photos, specs.
   Turn on "Show on website" to publish. Mark items **Sold out** when sold: the website then shows the first photo
   blurred with a SOLD stamp, and lists it under "Recently sold" in its category.
3. **Warranties > New warranty**: pick the product, start date and length. You get a code like `HBW-7KQ2-9XMA`;
   send it to the customer (copy or WhatsApp button). Anyone can check it at `/warranty`.
4. **Settings > Page content**: the warranty policy is a draft written for you. Change it to your real policy and tick
   "I have checked this policy". Until then the website shows it as a draft.
5. **Pre-orders**: when a customer asks you to source something on WhatsApp/Facebook, add it here and move it through
   Inquiry > Sourcing > Expected > Available > Completed. Customer details are never shown on the website.

6. **Sales ledger** (private, never on the website): your profit sheet. Set the yuan rate (1 ¥ = ? ৳) at the top,
   add what you bought (price in yuan or taka, shipping, extra cost) and press **Sold** with the selling price when it sells.
   Profit is counted only for sold items. At the end of the month press **Close month**: sold items stay in that month,
   unsold items move to the next month. Each month can be downloaded as a CSV file for Excel.

**Photos of sold products**: when you mark a product Sold, the cover photo stays (shown blurred with SOLD) and the other
photos move to a private archive (`api/storage/archive`) to save space. They come back if you put the product on sale
again, can be restored from the product page, and are deleted after the number of days set in Settings (default 90).
To delete them on time without opening the dashboard, you can add a daily cron job in cPanel:
`php /home/YOUR_CPANEL_USER/public_html/api/cli/cleanup.php`

---

## Tests

```powershell
cd C:\Users\ahasa\HyperByte
php api\tests\run.php
```

This starts a temporary server with a throw-away SQLite database (needs the `pdo_sqlite` extension, included in XAMPP)
and checks setup, login protection, products, photos, warranties, settings and more.

---

## Put it online (cPanel hosting)

### 1. Build the upload folder (on your PC)

```powershell
cd C:\Users\ahasa\HyperByte\client
npm.cmd run deploy
```

This creates `C:\Users\ahasa\HyperByte\deploy\public_html` with the website, the API and an empty `uploads` folder.

### 2. Database on the hosting

cPanel > **MySQL Database Wizard**: create a database and a user with a strong password, give the user **All privileges**.
Write down the full names (cPanel adds a prefix, for example `cpaneluser_hyperbyte`).

### 3. Upload

Right-click `deploy\public_html` > **Send to > Compressed (zipped) folder**. In cPanel **File Manager**, open `public_html`,
upload the zip and **Extract** it so `index.php`, `.htaccess`, `api/`, `assets/` and `uploads/` are directly inside `public_html`.
(Turn on "Show hidden files" in File Manager settings to see `.htaccess`.)

### 4. Create `api/.env` on the server

In File Manager, copy `public_html/api/.env.example` to `public_html/api/.env` and edit it:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://yourhyperbyte.com
DB_DRIVER=mysql
DB_HOST=localhost
DB_NAME=cpaneluser_hyperbyte
DB_USER=cpaneluser_hbuser
DB_PASS=the-database-password
SETUP_TOKEN=a-long-random-text-used-once
```

### 5. PHP version

cPanel > **Select PHP Version** (or MultiPHP Manager): choose **PHP 8.1 or newer** and make sure `gd`, `pdo_mysql`,
`fileinfo` and `intl` are ticked. For phone photos, `upload_max_filesize` of 10M or more is best
(the admin panel already shrinks big photos before uploading).

### 6. Domain and HTTPS

1. Point the domain to the hosting (at the domain company, set the nameservers your host gave you).
2. cPanel > **SSL/TLS Status** > **Run AutoSSL** (free certificate).
3. When `https://yourhyperbyte.com` works, open `public_html/.htaccess` and remove the `#` in front of the two
   HTTPS redirect lines and the `Strict-Transport-Security` line.

### 7. Finish

Open `https://yourhyperbyte.com/admin`, create the admin account with the `SETUP_TOKEN`, then delete `SETUP_TOKEN`
from `api/.env`. Fill in Settings and add products.

### Updating the live site later

Run `npm.cmd run deploy` again and upload the new files. **Do not** overwrite or delete `api/.env`, the
`uploads` folder or `api/storage` on the server (they hold your settings, product photos and archived photos).
Database changes in a new version are applied automatically on the first visit after the update.

---

## Backup and restore

- **Database**: cPanel > phpMyAdmin > select the database > **Export** (Quick, SQL). Save the `.sql` file.
  Restore: phpMyAdmin > **Import** that file into an empty database.
- **Photos**: download the `public_html/uploads` folder (File Manager > Compress > Download), and
  `public_html/api/storage/archive` if you want to keep the archived photos of sold items.
- **Settings**: keep a private copy of `api/.env` (never share it).

Do a backup before big changes, and about once a month.

---

## Security notes

- Passwords are stored as Argon2id/bcrypt hashes. Logins and warranty lookups are rate limited.
- Admin sessions use HttpOnly, SameSite=Strict cookies and a CSRF token for every change.
- Uploaded photos are checked (type, size, real image), re-saved without metadata, and the uploads folder only serves images.
- `api/.env`, `api/storage` and source files are blocked from the web by `.htaccess`.
- Warranty checks never show customer names, phone numbers or internal notes.
