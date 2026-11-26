<?php
// +Baixados.
//
// GET  baixados.php           → ranking das traduções mais baixadas.
// POST baixados.php           → {"translation_id": "..."}: soma 1 ao total.
//
// O app só envia o POST na primeira instalação de uma tradução no console
// (ou depois de desinstalada). O servidor ainda ignora repetições do mesmo
// endereço para a mesma tradução dentro de download_window_hours.

declare(strict_types=1);

require __DIR__ . '/lib.php';

$method = requireMethod('GET', 'POST');

if ($method === 'GET') {
    $limit = max(1, min(200, (int) config()['ranking_size']));
    $rows = db()->query(
        "SELECT translation_id, game_id, total FROM downloads
         WHERE total > 0 ORDER BY total DESC, updated_at DESC LIMIT $limit"
    )->fetchAll();
    $items = [];
    foreach ($rows as $index => $row) {
        $items[] = [
            'position' => $index + 1,
            'translation_id' => $row['translation_id'],
            'game_id' => $row['game_id'],
            'downloads' => (int) $row['total'],
        ];
    }
    respond(200, [
        'ok' => true,
        'version' => API_VERSION,
        'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
        'items' => $items,
    ]);
}

// POST: +1
$data = input();
$translationId = text($data, 'translation_id', 64);
if (!isSlug($translationId)) {
    fail(400, 'translation_id inválido.');
}
$translations = catalogTranslations();
if (!isset($translations[$translationId])) {
    fail(404, 'Tradução fora do catálogo.');
}
$gameId = $translations[$translationId];
$client = clientHash();
$hours = max(1, (int) config()['download_window_hours']);

$pdo = db();
$pdo->beginTransaction();
$recent = $pdo->prepare(
    "SELECT 1 FROM download_log
     WHERE client_hash = ? AND translation_id = ?
       AND created_at > (UTC_TIMESTAMP() - INTERVAL $hours HOUR) LIMIT 1"
);
$recent->execute([$client, $translationId]);
if ($recent->fetchColumn() !== false) {
    $pdo->commit();
    respond(200, ['ok' => true, 'counted' => false]);
}
$pdo->prepare(
    "INSERT INTO download_log (translation_id, client_hash, created_at)
     VALUES (?, ?, UTC_TIMESTAMP())"
)->execute([$translationId, $client]);
$pdo->prepare(
    "INSERT INTO downloads (translation_id, game_id, total, updated_at)
     VALUES (?, ?, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE total = total + 1, game_id = VALUES(game_id),
                             updated_at = UTC_TIMESTAMP()"
)->execute([$translationId, $gameId]);
// Registros antigos não servem mais para barrar repetições.
$pdo->exec(
    "DELETE FROM download_log WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 30 DAY)"
);
$pdo->commit();

respond(200, ['ok' => true, 'counted' => true]);
