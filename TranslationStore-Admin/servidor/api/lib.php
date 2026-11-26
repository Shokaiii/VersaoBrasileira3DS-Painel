<?php
// Funções comuns da API. Não é acessado direto (bloqueado no .htaccess).

declare(strict_types=1);

const API_VERSION = 1;

function config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            fail(500, 'config.php não encontrado no servidor.');
        }
        $config = require $file;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        try {
            $pdo = new PDO(
                "mysql:host={$c['db_host']};dbname={$c['db_name']};charset=utf8mb4",
                $c['db_user'],
                $c['db_pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            error_log('vb-api: ' . $e->getMessage());
            fail(503, 'Banco de dados indisponível.');
        }
    }
    return $pdo;
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): never
{
    respond($status, ['ok' => false, 'error' => $message]);
}

// Corpo JSON de um POST (o app envia JSON).
function input(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 16384);
    $data = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($data)) {
        fail(400, 'Corpo inválido: envie JSON.');
    }
    return $data;
}

function text(array $data, string $key, int $max): string
{
    $value = $data[$key] ?? '';
    if (!is_string($value)) {
        return '';
    }
    // Sem caracteres de controle (menos quebra de linha), sem espaços nas pontas.
    $value = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', $value) ?? '';
    $value = trim($value);
    return mb_substr($value, 0, $max);
}

function isSlug(string $value): bool
{
    return (bool) preg_match('/^[a-z0-9-]{1,64}$/', $value);
}

// Código irreversível do endereço de quem chamou (nunca o IP em si).
function clientHash(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return hash('sha256', config()['ip_salt'] . '|' . $ip);
}

// Traduções do catálogo publicado: [translation_id => game_id].
function catalogTranslations(): array
{
    static $map = null;
    if ($map !== null) {
        return $map;
    }
    $map = [];
    $raw = @file_get_contents(config()['catalog_file']);
    $catalog = $raw === false ? null : json_decode($raw, true);
    foreach (($catalog['games'] ?? []) as $game) {
        foreach (($game['translations'] ?? []) as $t) {
            if (isset($t['id'], $game['id'])) {
                $map[$t['id']] = $game['id'];
            }
        }
    }
    return $map;
}

function requireMethod(string ...$methods): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        fail(405, 'Método não permitido.');
    }
    return $method;
}
