"""Leitura e gravação dos cadastros em JSON local (data/)."""
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from .. import paths

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

DEFAULT_SETTINGS = {
    "base_url": "https://versaobrasileira3ds.com.br/versaobrasileirahb/",
    "catalog_url": "",  # vazio = base_url + "catalog.json"
    "catalog_version": "1.0.0",
    "last_generated": "",
    # Atualização do aplicativo (bloco "app" do version.json).
    "app_publish": False,
    "app_required": "nao",  # "sim": o app só abre depois de atualizar
    "app_notes": [],
}


def write_json(path: Path, data) -> None:
    """Grava de forma atômica: nunca deixa um JSON pela metade."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp, path)


def read_json(path: Path, default=None):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default


# --- Configurações -------------------------------------------------------------

def get_settings() -> dict:
    settings = dict(DEFAULT_SETTINGS)
    settings.update(read_json(paths.SETTINGS / "settings.json", {}) or {})
    return settings


def save_settings(values: dict) -> dict:
    settings = get_settings()
    for key in DEFAULT_SETTINGS:
        if key in values:
            settings[key] = values[key]
    if settings["base_url"] and not settings["base_url"].endswith("/"):
        settings["base_url"] += "/"
    write_json(paths.SETTINGS / "settings.json", settings)
    return settings


def catalog_url(settings: dict) -> str:
    return settings.get("catalog_url") or settings["base_url"] + "catalog.json"


# --- Jogos ---------------------------------------------------------------------

def game_path(game_id: str) -> Path:
    if not SLUG.match(game_id or ""):
        raise ValueError("Identificador inválido: use letras minúsculas, números e hífens.")
    return paths.GAMES / f"{game_id}.json"


def list_games() -> list:
    games = []
    for file in sorted(paths.GAMES.glob("*.json")):
        game = read_json(file)
        if isinstance(game, dict) and game.get("id"):
            games.append(game)
    games.sort(key=lambda g: fold(g.get("name", "")))
    return games


def get_game(game_id: str):
    return read_json(game_path(game_id))


def save_game(game: dict) -> dict:
    write_json(game_path(game["id"]), game)
    return game


def delete_game(game_id: str) -> None:
    game = get_game(game_id)
    path = game_path(game_id)
    if path.exists():
        path.unlink()
    shutil.rmtree(paths.IMAGES / game_id, ignore_errors=True)
    for translation in (game or {}).get("translations", []):
        if SLUG.match(translation.get("id", "")):
            shutil.rmtree(paths.FILES / translation["id"], ignore_errors=True)


def fold(text: str) -> str:
    """Minúsculas sem acentos, para ordenar como o aplicativo."""
    import unicodedata
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


# --- Arquivos de tradução ------------------------------------------------------

def file_folder(translation_id: str) -> Path:
    if not SLUG.match(translation_id or ""):
        raise ValueError("Identificador de tradução inválido.")
    return paths.FILES / translation_id


def safe_name(name: str) -> str:
    name = Path(name or "").name.strip()
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    if not name or name in (".", ".."):
        raise ValueError("Nome de arquivo inválido.")
    return name
