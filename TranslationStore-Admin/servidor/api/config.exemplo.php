<?php
// Configuração da API do Versão Brasileira.
//
// No servidor, copie este arquivo para config.php (na mesma pasta) e preencha
// os valores marcados com TROQUE. O config.php fica só no servidor: ele não
// vai para o GitHub.

return [
    // Banco de dados (cPanel → Database Wizard).
    'db_host' => 'localhost',
    'db_name' => 'janvic19_vbrasil',
    'db_user' => 'janvic19_vbapp',
    'db_pass' => 'TROQUE pela senha do usuário do banco',

    // Mensagens do Contato: quem envia e quem recebe.
    'mail_from' => 'contato@versaobrasileira3ds.com.br',
    'mail_to'   => 'contato@versaobrasileira3ds.com.br',

    // Envio por SMTP autenticado (Titan). Com smtp_pass vazio, o envio usa o
    // mail() do PHP, que não chega ao Titan.
    'smtp_host'   => 'smtp.titan.email',
    'smtp_port'   => 465,
    'smtp_secure' => 'ssl', // 'ssl' (porta 465), 'tls' (587, STARTTLS) ou 'none'
    'smtp_user'   => 'contato@versaobrasileira3ds.com.br',
    'smtp_pass'   => 'TROQUE pela senha do e-mail contato@ no Titan',

    // Chave que o painel usa para ler as mensagens (mensagens.php). Use um
    // texto longo e aleatório (pelo menos 32 caracteres) e guarde: ela vai
    // também nas Configurações do painel.
    'panel_key' => 'TROQUE por uma chave longa e aleatória',

    // Usado para guardar o endereço de quem envia só como um código
    // irreversível (nunca o IP em si). Outro texto longo e aleatório,
    // diferente da chave acima. Não precisa guardar.
    'ip_salt' => 'TROQUE por outro texto longo e aleatório',

    // catalog.json publicado, para conferir os identificadores enviados pelo
    // app. Caminho a partir desta pasta.
    'catalog_file' => __DIR__ . '/../catalog.json',

    // Limites contra abuso.
    'download_window_hours' => 24, // um +1 por tradução e endereço nesse intervalo
    'contact_per_hour' => 5,       // mensagens por endereço por hora
    'ranking_size' => 50,
];
