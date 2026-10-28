<?php
declare(strict_types=1);
defined('HB_API') || exit;

// An error with an HTTP status code. Throw it from any handler.
final class HttpError extends Exception
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }

    public static function validation(array $errors, string $message = 'Please fix the highlighted fields.'): self
    {
        return new self(422, $message, ['errors' => $errors]);
    }
}

final class Request
{
    public string $method;
    public string $path;
    public array $query;
    public array $params = [];
    private ?array $body = null;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        // Some hosts block PUT/PATCH/DELETE, so the website sends POST with this header instead.
        $override = strtoupper((string) ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? ''));
        if ($this->method === 'POST' && in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) {
            $this->method = $override;
        }
        $this->query = $_GET;
        $uriPath = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
        // The API lives in a folder (normally /api). Remove it from the path.
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
        if ($base !== '' && str_starts_with($uriPath, $base)) {
            $uriPath = substr($uriPath, strlen($base));
        }
        $this->path = '/' . trim($uriPath, '/');
    }

    /** JSON body or form fields. */
    public function body(): array
    {
        if ($this->body !== null) {
            return $this->body;
        }
        $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if (str_contains($type, 'application/json')) {
            $raw = file_get_contents('php://input', false, null, 0, 2_000_000) ?: '';
            $data = $raw === '' ? [] : json_decode($raw, true);
            if (!is_array($data)) {
                throw new HttpError(400, 'The request body is not valid JSON.');
            }
            return $this->body = $data;
        }
        return $this->body = $_POST;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function q(string $key, string $default = ''): string
    {
        $value = $this->query[$key] ?? $default;
        return is_string($value) ? $value : $default;
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return (string) ($_SERVER[$key] ?? '');
    }

    /** Uploaded files for a field like images[] as a simple list. */
    public function files(string $field): array
    {
        $f = $_FILES[$field] ?? null;
        if (!$f) {
            return [];
        }
        if (!is_array($f['name'])) {
            return [$f];
        }
        $list = [];
        foreach ($f['name'] as $i => $name) {
            $list[] = [
                'name' => $name,
                'type' => $f['type'][$i] ?? '',
                'tmp_name' => $f['tmp_name'][$i] ?? '',
                'error' => $f['error'][$i] ?? UPLOAD_ERR_NO_FILE,
                'size' => $f['size'][$i] ?? 0,
            ];
        }
        return $list;
    }
}

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Referrer-Policy: same-origin');
            header('Cache-Control: no-store');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}

// Matches "METHOD /path/{param}" routes and calls the handler.
final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(Request $req): never
    {
        $pathMatched = false;
        foreach ($this->routes as [$method, $regex, $handler]) {
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($method !== $req->method) {
                continue;
            }
            $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            $result = $handler($req);
            Response::json($result ?? ['ok' => true]);
        }
        if ($pathMatched) {
            throw new HttpError(405, 'This method is not allowed here.');
        }
        throw new HttpError(404, 'Not found: ' . $req->method . ' /api' . $req->path);
    }
}
