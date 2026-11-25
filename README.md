# Versão Brasileira 3DS — Painel

Painel administrativo local do [Versão Brasileira 3DS](https://github.com/Shokaiii/VersaoBrasileira3DS). Roda só no computador (`http://127.0.0.1:8765`) e gera os arquivos que vão para o servidor: `version.json`, `catalog.json`, imagens, pacotes das traduções e, quando publicado, o próprio aplicativo.

## Conteúdo

```
TranslationStore-Admin/   painel (Python + FastAPI, HTML/CSS/JS)
  backend/                servidor local, validação e geração do catálogo
  frontend/               telas do painel
  data/games/             cadastro dos jogos e traduções
  data/images/            ícones e capas no tamanho do 3DS
  data/settings/          endereço do servidor e versões
iniciar_painel.bat        abre o painel no Windows
```

Os pacotes das traduções (`data/files/`) e a pasta gerada (`output/`) não ficam no repositório.

## Iniciar

Requer Python 3.10 ou mais novo ([python.org](https://www.python.org/downloads/), marcando "Add python.exe to PATH").

Dê dois cliques em `iniciar_painel.bat`. Na primeira vez ele prepara o ambiente e instala as bibliotecas; depois abre o navegador. Para fechar, feche a janela preta.

O passo a passo de uso está em `TranslationStore-Admin/README.md`.

## Licença

GPL-3.0 — veja `LICENSE`.
