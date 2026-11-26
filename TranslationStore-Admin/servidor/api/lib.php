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

// --- E-mail --------------------------------------------------------------------

// Envia um e-mail de texto. Usa SMTP autenticado quando smtp_pass está
// preenchido; senão, o mail() do PHP. Retorna false e registra o motivo no
// log de erros do PHP em caso de falha.
function sendMail(string $subject, string $body, string $replyTo = ''): bool
{
    $c = config();
    $pass = (string) ($c['smtp_pass'] ?? '');
    if ($pass === '' || str_starts_with($pass, 'TROQUE')) {
        return sendWithMail($subject, $body, $replyTo);
    }
    try {
        smtpSend($subject, $body, $replyTo);
        return true;
    } catch (RuntimeException $e) {
        error_log('vb-api smtp: ' . $e->getMessage());
        return false;
    }
}

function encodedSubject(string $subject): string
{
    return '=?UTF-8?B?' . base64_encode($subject) . '?=';
}

function sendWithMail(string $subject, string $body, string $replyTo): bool
{
    $c = config();
    $headers = [
        'From: ' . encodedSubject('Versão Brasileira') . ' <' . $c['mail_from'] . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    if ($replyTo !== '') {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    return @mail($c['mail_to'], encodedSubject($subject), $body,
                 implode("\r\n", $headers), '-f' . $c['mail_from']);
}

function smtpSend(string $subject, string $body, string $replyTo): void
{
    $c = config();
    $host = (string) $c['smtp_host'];
    $port = (int) ($c['smtp_port'] ?? 465);
    $secure = (string) ($c['smtp_secure'] ?? 'ssl');
    $from = (string) $c['mail_from'];
    $to = (string) $c['mail_to'];

    $context = stream_context_create(['ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
        'peer_name' => $host,
    ]]);
    $address = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $socket = @stream_socket_client($address, $errno, $errstr, 15,
                                    STREAM_CLIENT_CONNECT, $context);
    if ($socket === false) {
        throw new RuntimeException("conexão com $address falhou: $errstr ($errno)");
    }
    stream_set_timeout($socket, 15);

    // Lê a resposta (várias linhas "250-...") e confere o código.
    $expect = function (int ...$codes) use ($socket): string {
        $text = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $text .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        $code = (int) substr($text, 0, 3);
        if (!in_array($code, $codes, true)) {
            throw new RuntimeException('resposta inesperada: ' . trim($text));
        }
        return $text;
    };
    $command = function (string $line, int ...$codes) use ($socket, $expect): string {
        fwrite($socket, $line . "\r\n");
        return $expect(...$codes);
    };

    try {
        $expect(220);
        $helo = gethostname() ?: 'localhost';
        $command("EHLO $helo", 250);
        if ($secure === 'tls') {
            $command('STARTTLS', 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('STARTTLS falhou');
            }
            $command("EHLO $helo", 250);
        }
        $command('AUTH LOGIN', 334);
        $command(base64_encode((string) $c['smtp_user']), 334);
        $command(base64_encode((string) $c['smtp_pass']), 235);
        $command("MAIL FROM:<$from>", 250);
        $command("RCPT TO:<$to>", 250, 251);
        $command('DATA', 354);

        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . encodedSubject('Versão Brasileira') . ' <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: ' . encodedSubject($subject),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        if ($replyTo !== '') {
            $headers[] = 'Reply-To: <' . $replyTo . '>';
        }
        // Linhas que começam com ponto ganham outro ponto (regra do SMTP).
        $lines = preg_split('/\r\n|\r|\n/', $body) ?: [];
        $text = implode("\r\n", array_map(
            fn ($line) => str_starts_with($line, '.') ? '.' . $line : $line, $lines));
        fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . $text . "\r\n.\r\n");
        $expect(250);
        $command('QUIT', 221);
    } finally {
        fclose($socket);
    }
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
