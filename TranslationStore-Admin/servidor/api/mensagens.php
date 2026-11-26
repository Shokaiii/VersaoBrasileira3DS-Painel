<?php
// Mensagens do Contato para o painel. Exige a chave do painel no cabeçalho
// X-Painel-Chave.
//
// GET  mensagens.php?desde=ID     → mensagens com id maior que ID (até 200).
// POST mensagens.php {"lida": ID} → marca como lida.
// POST mensagens.php {"apagar": ID} → apaga.

declare(strict_types=1);

require __DIR__ . '/lib.php';

$method = requireMethod('GET', 'POST');

$key = (string) ($_SERVER['HTTP_X_PAINEL_CHAVE'] ?? '');
$expected = (string) config()['panel_key'];
if (strlen($expected) < 32 || str_starts_with($expected, 'TROQUE') || !hash_equals($expected, $key)) {
    fail(401, 'Chave do painel inválida.');
}

$pdo = db();

if ($method === 'GET') {
    $since = max(0, (int) ($_GET['desde'] ?? 0));
    $query = $pdo->prepare(
        "SELECT id, kind, game_id, translation_id, game_name, body, contact, app_version,
                created_at, read_at, emailed
         FROM messages WHERE id > ? ORDER BY id ASC LIMIT 200"
    );
    $query->execute([$since]);
    $items = [];
    foreach ($query->fetchAll() as $row) {
        $row['id'] = (int) $row['id'];
        $row['emailed'] = (bool) $row['emailed'];
        $items[] = $row;
    }
    respond(200, ['ok' => true, 'items' => $items]);
}

$data = input();
if (isset($data['lida'])) {
    $pdo->prepare('UPDATE messages SET read_at = UTC_TIMESTAMP() WHERE id = ? AND read_at IS NULL')
        ->execute([(int) $data['lida']]);
    respond(200, ['ok' => true]);
}
if (isset($data['apagar'])) {
    $pdo->prepare('DELETE FROM messages WHERE id = ?')->execute([(int) $data['apagar']]);
    respond(200, ['ok' => true]);
}
fail(400, 'Nada a fazer.');
