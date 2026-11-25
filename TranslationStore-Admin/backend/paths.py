"""Pastas do painel. Tudo fica dentro de TranslationStore-Admin/."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DATA = ROOT / "data"
GAMES = DATA / "games"          # um JSON por jogo (com as traduções)
SETTINGS = DATA / "settings"    # settings.json
IMAGES = DATA / "images"        # images/<game-id>/icon.png e cover.jpg
FILES = DATA / "files"          # files/<translation-id>/<arquivo>
OUTPUT = ROOT / "output"        # pronto para enviar ao servidor

# Aplicativo compilado (compilar.bat deixa os arquivos na raiz do projeto).
PROJECT = ROOT.parent
APP_VERSION_FILE = PROJECT / "TranslationStore" / "VERSION"
APP_3DSX = PROJECT / "VersaoBrasileira.3dsx"
APP_CIA = PROJECT / "VersaoBrasileira.cia"

for folder in (GAMES, SETTINGS, IMAGES, FILES, OUTPUT):
    folder.mkdir(parents=True, exist_ok=True)

# Tamanhos das imagens no aplicativo (Especificação 02, §5).
ICON_SIZE = (48, 48)
COVER_SIZE = (112, 128)
