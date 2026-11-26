<?php
// Cria as tabelas da API. Abra uma vez no navegador e depois apague este
// arquivo do servidor. Rodar de novo não apaga nada (só cria o que faltar).

declare(strict_types=1);

require __DIR__ . '/lib.php';

$statements = [
    // Total de downloads por tradução (o ranking).
    "CREATE TABLE IF NOT EXISTS downloads (
        translation_id VARCHAR(64) NOT NULL PRIMARY KEY,
        game_id VARCHAR(64) NOT NULL,
        total INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // Cada +1 aceito, para barrar repetições do mesmo endereço.
    "CREATE TABLE IF NOT EXISTS download_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        translation_id VARCHAR(64) NOT NULL,
        client_hash CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL,
        KEY recent (client_hash, translation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // Mensagens do Contato.
    "CREATE TABLE IF NOT EXISTS messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(16) NOT NULL,
        game_id VARCHAR(64) NOT NULL DEFAULT '',
        translation_id VARCHAR(64) NOT NULL DEFAULT '',
        game_name VARCHAR(160) NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        contact VARCHAR(160) NOT NULL DEFAULT '',
        app_version VARCHAR(16) NOT NULL DEFAULT '',
        client_hash CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL,
        read_at DATETIME NULL,
        emailed TINYINT(1) NOT NULL DEFAULT 0,
        KEY by_client (client_hash, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
];

try {
    foreach ($statements as $sql) {
        db()->exec($sql);
    }
} catch (PDOException $e) {
    error_log('vb-api instalar: ' . $e->getMessage());
    fail(500, 'Não foi possível criar as tabelas: ' . $e->getMessage());
}

respond(200, [
    'ok' => true,
    'message' => 'Tabelas criadas. Agora apague o instalar.php do servidor.',
]);
