<?php
// Contato.
//
// POST contato.php com JSON:
//   kind          "erro" | "pedido" | "outro"
//   message       texto (obrigatório, até 2000 caracteres)
//   contact       Discord, e-mail etc. (opcional)
//   game_id, translation_id, game_name   (opcionais: de onde a mensagem veio)
//   app_version   versão do app
//
// Grava no banco (o painel lê por mensagens.php) e envia por e-mail.

declare(strict_types=1);

require __DIR__ . '/lib.php';

requireMethod('POST');

const KINDS = [
    'erro' => 'Erro numa tradução',
    'pedido' => 'Pedido de tradução',
    'outro' => 'Outro assunto',
];

$data = input();
$kind = text($data, 'kind', 16);
if (!isset(KINDS[$kind])) {
    fail(400, 'Tipo de mensagem inválido.');
}
$body = text($data, 'message', 2000);
if (mb_strlen($body) < 3) {
    fail(400, 'Escreva a mensagem.');
}
$contact = text($data, 'contact', 160);
$gameId = text($data, 'game_id', 64);
$translationId = text($data, 'translation_id', 64);
$gameName = text($data, 'game_name', 160);
$appVersion = text($data, 'app_version', 16);
if ($gameId !== '' && !isSlug($gameId)) {
    $gameId = '';
}
if ($translationId !== '' && !isSlug($translationId)) {
    $translationId = '';
}

$client = clientHash();
$pdo = db();
$count = $pdo->prepare(
    "SELECT COUNT(*) FROM messages
     WHERE client_hash = ? AND created_at > (UTC_TIMESTAMP() - INTERVAL 1 HOUR)"
);
$count->execute([$client]);
if ((int) $count->fetchColumn() >= max(1, (int) config()['contact_per_hour'])) {
    fail(429, 'Muitas mensagens em pouco tempo. Tente de novo mais tarde.');
}

$pdo->prepare(
    "INSERT INTO messages (kind, game_id, translation_id, game_name, body, contact,
                           app_version, client_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())"
)->execute([$kind, $gameId, $translationId, $gameName, $body, $contact, $appVersion, $client]);
$id = (int) $pdo->lastInsertId();

// E-mail (texto puro). Falhar no envio não perde a mensagem: ela já está no
// banco e aparece no painel.
$c = config();
$subject = 'Versão Brasileira — ' . KINDS[$kind] . ($gameName !== '' ? ': ' . $gameName : '');
$lines = [
    'Tipo: ' . KINDS[$kind],
    'Jogo: ' . ($gameName !== '' ? $gameName : '—') . ($gameId !== '' ? " ($gameId)" : ''),
    'Tradução: ' . ($translationId !== '' ? $translationId : '—'),
    'Contato: ' . ($contact !== '' ? $contact : '—'),
    'Versão do app: ' . ($appVersion !== '' ? $appVersion : '—'),
    'Mensagem nº ' . $id,
    '',
    $body,
];
$headers = [
    'From: Versão Brasileira <' . $c['mail_from'] . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];
if (filter_var($contact, FILTER_VALIDATE_EMAIL)) {
    $headers[] = 'Reply-To: ' . $contact;
}
$sent = @mail(
    $c['mail_to'],
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    implode("\r\n", $lines),
    implode("\r\n", $headers),
    '-f' . $c['mail_from']
);
if ($sent) {
    $pdo->prepare('UPDATE messages SET emailed = 1 WHERE id = ?')->execute([$id]);
}

respond(200, ['ok' => true, 'id' => $id]);
