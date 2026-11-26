# API do Versão Brasileira (servidor)

Scripts PHP que ficam no servidor, ao lado do `version.json` e do `catalog.json`:

```
versaobrasileirahb/
├── version.json, catalog.json, images/, files/, app/   (gerados pelo painel)
└── api/
    ├── .htaccess          bloqueia config.php e lib.php no navegador
    ├── config.php         dados do banco, e-mails e chaves (só no servidor)
    ├── lib.php            funções comuns
    ├── instalar.php       cria as tabelas (rodar uma vez e apagar)
    ├── baixados.php       ranking e +1 das traduções
    ├── contato.php        mensagens do app (banco + e-mail)
    └── mensagens.php      mensagens para o painel (com a chave do painel)
```

Requisitos: PHP 8.1 ou mais novo, MySQL/MariaDB, conta de e-mail do domínio (Titan, enviada por SMTP autenticado).

## Instalar (cPanel)

1. **Gerenciador de Arquivos** → `public_html/versaobrasileirahb/` → crie a pasta `api`.
2. Envie para `api/` os arquivos desta pasta: `.htaccess`, `lib.php`, `instalar.php`, `baixados.php`, `contato.php`, `mensagens.php` e `config.exemplo.php`. (Para ver o `.htaccess` no Gerenciador, ative "Mostrar arquivos ocultos" em Configurações.)
3. Copie `config.exemplo.php` para `config.php` e edite o `config.php`:
   - `db_pass`: a senha do usuário do banco;
   - `panel_key`: um texto longo e aleatório (32 caracteres ou mais) — guarde, vai no painel;
   - `ip_salt`: outro texto longo e aleatório;
   - `smtp_pass`: a senha da conta `contato@` no Titan (o envio dos e-mails do Contato é feito por SMTP, em `smtp.titan.email`, porta 465).
4. Abra `https://versaobrasileira3ds.com.br/versaobrasileirahb/api/instalar.php`. Deve aparecer `"ok":true`. **Apague o `instalar.php`** do servidor.
5. No **Titan**, nas configurações da conta `contato@`, ative o **acesso por apps de terceiros (IMAP/SMTP)**. Sem isso, o envio dos e-mails do Contato falha com "535 authentication failed" (a mensagem ainda fica gravada e aparece no painel).
6. Confira:
   - `.../api/baixados.php` mostra `{"ok":true, ..., "items":[]}`;
   - `.../api/config.php` mostra erro de acesso (403).

## Endpoints

| Endereço | Uso |
|---|---|
| `GET baixados.php` | Ranking: `items[]` com `position`, `translation_id`, `game_id`, `downloads`. |
| `POST baixados.php` | `{"translation_id"}` → soma 1. Só aceita traduções do `catalog.json`; o mesmo endereço não conta duas vezes a mesma tradução em 24 h. |
| `POST contato.php` | `{"kind": "erro"\|"pedido"\|"outro", "message", "contact", "game_id", "translation_id", "game_name", "app_version"}`. Até 5 por hora por endereço. |
| `GET mensagens.php?desde=ID` | Mensagens novas (cabeçalho `X-Painel-Chave`). |
| `POST mensagens.php` | `{"lida": ID}` ou `{"apagar": ID}` (cabeçalho `X-Painel-Chave`). |

Respostas sempre em JSON com `ok`. O endereço de quem envia é guardado só como código irreversível (sha256 com `ip_salt`), nunca o IP.
