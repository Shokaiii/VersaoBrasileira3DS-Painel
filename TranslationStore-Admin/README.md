# Versão Brasileira — Painel administrativo

Painel que roda no computador e gera os arquivos do catálogo do aplicativo 3DS.
Não é um site na internet: abre em `http://127.0.0.1:8765` só no seu computador.

## Iniciar

Dê dois cliques em **`iniciar_painel.bat`** (na raiz do projeto). Na primeira vez ele
cria um ambiente Python e instala as bibliotecas (precisa de internet); depois abre o
navegador sozinho. Para fechar o painel, feche a janela preta.

Requisito: Python 3.10 ou mais novo (python.org — marque "Add python.exe to PATH" na
instalação).

## Uso

1. **Jogos → + Novo jogo**: nome, identificador e plataforma.
2. No jogo: dados, Title IDs, ícone e capa (qualquer imagem; o painel recorta e reduz
   para 48×48 e 192×128).
3. **+ Nova tradução**: dados, equipe, compatibilidade, **Enviar arquivos…** (o pacote
   da tradução) e as **etapas de instalação** (há modelos prontos: LayeredFS e CIA).
4. **Salvar** (ou Ctrl+S).
5. **Gerar catálogo**: confere tudo, aumenta a versão e grava a pasta `output/`.
6. Envie **todo o conteúdo de `output/`** (version.json, catalog.json, images/, files/)
   para a pasta do servidor configurada em **Configurações**.

## Onde ficam os dados

```
data/games/      um JSON por jogo (com as traduções)
data/images/     ícones e capas já no tamanho do 3DS
data/files/      arquivos das traduções
data/settings/   endereço do servidor e versão do catálogo
output/          o que vai para o servidor
```

Para fazer cópia de segurança, basta copiar a pasta `data/`.
