<?php
declare(strict_types=1);
defined('HB_API') || exit;

// Checks and saves uploaded photos. Every photo is decoded and re-saved
// (as WebP when possible), which strips hidden data and any embedded code,
// and a smaller thumbnail is made for product cards.
final class Images
{
    public const MAX_BYTES = 10 * 1024 * 1024;
    private const MAX_PIXELS = 40_000_000;
    private const FULL_SIZE = 1800;
    private const THUMB_SIZE = 720;
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public static function uploadDir(): string
    {
        $dir = Env::get('UPLOAD_DIR', dirname(HB_API_DIR) . '/uploads');
        if (!preg_match('#^([A-Za-z]:[\\\\/]|/)#', $dir)) {
            $dir = dirname(HB_API_DIR) . '/' . $dir; // relative to the project / public_html folder
        }
        return rtrim($dir, '/\\');
    }

    /**
     * Validates one uploaded file and saves it under uploads/$folder/YYYY/MM/.
     * Returns ['path' => '/uploads/...', 'thumb' => '/uploads/...', 'width' => int, 'height' => int].
     */
    public static function store(array $file, string $folder): array
    {
        $name = Util::line($file['name'] ?? 'photo', 120);
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            throw new HttpError(422, "\"$name\" is too large. The server accepts photos up to " . self::serverLimitText() . '.');
        }
        if ($error !== UPLOAD_ERR_OK) {
            throw new HttpError(422, "\"$name\" did not upload completely. Please try again.");
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new HttpError(422, 'Upload failed. Please try again.');
        }
        $size = (int) filesize($tmp);
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw new HttpError(422, "\"$name\" is larger than 10 MB. Please resize it first.");
        }

        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        if (!isset(self::TYPES[$mime])) {
            throw new HttpError(422, "\"$name\" is not a JPG, PNG or WebP photo. (iPhone HEIC photos must be converted to JPG first.)");
        }
        $info = @getimagesize($tmp);
        if (!$info || $info[0] < 32 || $info[1] < 32) {
            throw new HttpError(422, "\"$name\" is not a valid image.");
        }
        [$width, $height] = $info;
        if ($width * $height > self::MAX_PIXELS) {
            throw new HttpError(422, "\"$name\" is too large ({$width}×{$height}). Please use a photo under 40 megapixels.");
        }

        $sub = trim($folder, '/') . '/' . gmdate('Y/m');
        $dir = self::uploadDir() . '/' . $sub;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new HttpError(500, 'The uploads folder is not writable on the server.');
        }
        $base = bin2hex(random_bytes(10));

        if (!self::gdAvailable($mime)) {
            // Without GD we keep the original file (already verified above).
            $ext = self::TYPES[$mime];
            $target = "$dir/$base.$ext";
            if (!move_uploaded_file($tmp, $target) && !copy($tmp, $target)) {
                throw new HttpError(500, 'Could not save the photo on the server.');
            }
            @chmod($target, 0644);
            $url = "/uploads/$sub/$base.$ext";
            return ['path' => $url, 'thumb' => $url, 'width' => $width, 'height' => $height];
        }

        @ini_set('memory_limit', '512M');
        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($tmp),
            'image/png' => @imagecreatefrompng($tmp),
            'image/webp' => @imagecreatefromwebp($tmp),
        };
        if (!$image) {
            throw new HttpError(422, "\"$name\" could not be read. Please try another photo.");
        }
        if ($mime === 'image/jpeg') {
            $image = self::fixOrientation($image, $tmp);
        }

        $ext = function_exists('imagewebp') ? 'webp' : 'jpg';
        $full = self::resize($image, self::FULL_SIZE);
        $thumb = self::resize($image, self::THUMB_SIZE);
        $fullPath = "$dir/$base.$ext";
        $thumbPath = "$dir/{$base}_t.$ext";
        self::write($full, $fullPath, $ext, 84);
        self::write($thumb, $thumbPath, $ext, 78);
        return [
            'path' => "/uploads/$sub/$base.$ext",
            'thumb' => "/uploads/$sub/{$base}_t.$ext",
            'width' => imagesx($full),
            'height' => imagesy($full),
        ];
    }

    /** Deletes a file from the uploads folder (and never anything outside it). */
    public static function delete(?string $publicPath): void
    {
        if (!$publicPath || !str_starts_with($publicPath, '/uploads/')) {
            return;
        }
        $root = realpath(self::uploadDir());
        $file = realpath(self::uploadDir() . substr($publicPath, strlen('/uploads')));
        if ($root && $file && str_starts_with($file, $root . DIRECTORY_SEPARATOR) && is_file($file)) {
            @unlink($file);
        }
    }

    // ---------------------------------------------------------------- archive
    // Extra photos of sold products are moved out of the public uploads folder
    // into api/storage/archive (blocked from the web), kept for a while for
    // warranty questions, and deleted later by purgeArchive().

    private static function archiveDir(): string
    {
        $dir = Env::get('ARCHIVE_DIR', HB_API_DIR . '/storage/archive');
        if (!preg_match('#^([A-Za-z]:[\\\\/]|/)#', $dir)) {
            $dir = HB_API_DIR . '/' . $dir; // relative to the api folder
        }
        return rtrim($dir, '/\\');
    }

    private static function localPath(string $root, string $publicPath): ?string
    {
        if (!str_starts_with($publicPath, '/uploads/') || str_contains($publicPath, '..') || str_contains($publicPath, "\0")) {
            return null;
        }
        return $root . substr($publicPath, strlen('/uploads'));
    }

    /**
     * Moves files between the uploads folder and the archive. All or nothing:
     * if one file cannot be moved, the ones already moved go back and false is
     * returned. Files that are already in the target place count as moved.
     */
    private static function moveAll(array $publicPaths, bool $toArchive): bool
    {
        $moved = [];
        foreach (array_unique(array_filter($publicPaths)) as $path) {
            $up = self::localPath(self::uploadDir(), $path);
            $ar = self::localPath(self::archiveDir(), $path);
            if (!$up || !$ar) {
                continue;
            }
            [$from, $to] = $toArchive ? [$up, $ar] : [$ar, $up];
            if (!is_file($from)) {
                continue; // nothing to move (already moved, or the file was removed by hand)
            }
            $dir = dirname($to);
            if (!is_dir($dir) && !@mkdir($dir, $toArchive ? 0700 : 0755, true) && !is_dir($dir)) {
                self::undo($moved);
                return false;
            }
            if (!@rename($from, $to)) {
                if (!(@copy($from, $to) && @unlink($from))) {
                    @unlink($to);
                    self::undo($moved);
                    return false;
                }
            }
            $moved[] = [$from, $to];
        }
        return true;
    }

    private static function undo(array $moved): void
    {
        foreach (array_reverse($moved) as [$from, $to]) {
            @rename($to, $from);
        }
    }

    public static function archive(array $publicPaths): bool
    {
        return self::moveAll($publicPaths, true);
    }

    public static function unarchive(array $publicPaths): bool
    {
        return self::moveAll($publicPaths, false);
    }

    /** Deletes an archived copy (never anything outside the archive folder). */
    public static function deleteArchived(?string $publicPath): void
    {
        if (!$publicPath) {
            return;
        }
        $root = realpath(self::archiveDir());
        $file = self::localPath(self::archiveDir(), $publicPath);
        $real = $file ? realpath($file) : false;
        if ($root && $real && str_starts_with($real, $root . DIRECTORY_SEPARATOR) && is_file($real)) {
            @unlink($real);
        }
    }

    private static function gdAvailable(string $mime): bool
    {
        if (!extension_loaded('gd')) {
            return false;
        }
        return match ($mime) {
            'image/jpeg' => function_exists('imagecreatefromjpeg'),
            'image/png' => function_exists('imagecreatefrompng'),
            'image/webp' => function_exists('imagecreatefromwebp'),
            default => false,
        };
    }

    private static function resize(GdImage $src, int $maxSide): GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, $maxSide / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        $transparent = imagecolorallocatealpha($dst, 255, 255, 255, 127);
        imagefilledrectangle($dst, 0, 0, $nw, $nh, $transparent);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    private static function write(GdImage $img, string $path, string $ext, int $quality): void
    {
        if ($ext === 'webp') {
            $ok = imagewebp($img, $path, $quality);
        } else {
            // JPEG has no transparency: paint it on white first.
            $w = imagesx($img);
            $h = imagesy($img);
            $flat = imagecreatetruecolor($w, $h);
            imagefilledrectangle($flat, 0, 0, $w, $h, imagecolorallocate($flat, 255, 255, 255));
            imagecopy($flat, $img, 0, 0, 0, 0, $w, $h);
            imageinterlace($flat, true);
            $ok = imagejpeg($flat, $path, $quality);
        }
        if (!$ok) {
            throw new HttpError(500, 'Could not save the photo on the server.');
        }
        @chmod($path, 0644);
    }

    private static function fixOrientation(GdImage $image, string $file): GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $image;
        }
        $exif = @exif_read_data($file);
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $image;
        }
        $rotated = imagerotate($image, $angle, 0);
        return $rotated ?: $image;
    }

    private static function serverLimitText(): string
    {
        return (string) ini_get('upload_max_filesize');
    }

    /** "8M" -> 8388608 */
    private static function iniBytes(string $value): int
    {
        $value = trim($value);
        $number = (int) $value;
        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };
    }

    /**
     * When a request is bigger than post_max_size, PHP silently drops every
     * file. Call this before reading uploads to give a clear message instead.
     */
    public static function assertRequestFits(): void
    {
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $limit = self::iniBytes((string) ini_get('post_max_size'));
        if ($limit > 0 && $length > $limit) {
            throw new HttpError(413, 'This upload is larger than the server allows (' . ini_get('post_max_size') . ' per upload). Send fewer or smaller photos at a time.');
        }
    }
}
