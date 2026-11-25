"""Importa um catalog.json existente (e, se informada, a pasta com images/ e
files/ do servidor) para os cadastros do painel."""
import shutil
from pathlib import Path

from .. import paths
from ..models import media, store


def import_catalog(catalog: dict, folder: str = "", replace: bool = False) -> dict:
    base = Path(folder) if folder else None
    if base is not None and not base.is_dir():
        raise ValueError(f"Pasta não encontrada: {folder}")
    if not isinstance(catalog, dict) or not isinstance(catalog.get("games"), list):
        raise ValueError("Este arquivo não é um catalog.json válido (falta \"games\").")

    if replace:
        for file in paths.GAMES.glob("*.json"):
            file.unlink()
        shutil.rmtree(paths.IMAGES, ignore_errors=True)
        shutil.rmtree(paths.FILES, ignore_errors=True)
        paths.IMAGES.mkdir(parents=True, exist_ok=True)
        paths.FILES.mkdir(parents=True, exist_ok=True)

    report = {"games": 0, "translations": 0, "images": 0, "files": 0, "missing": []}
    for game in catalog["games"]:
        record = {key: game.get(key) for key in
                  ("id", "name", "platform", "description", "publisher", "release_year",
                   "genres", "title_ids") if game.get(key) not in (None, "")}
        record.setdefault("platform", "3ds")
        record.setdefault("title_ids", [])
        record["translations"] = []
        store.game_path(record["id"])  # valida o id

        images = game.get("images") or {}
        for kind in ("icon", "cover"):
            url = (images.get(kind) or {}).get("url", "")
            if base is not None and url and not url.startswith(("http://", "https://")):
                source = base / url
                if source.is_file():
                    media.save_image(record["id"], kind, source.read_bytes())
                    report["images"] += 1
                else:
                    report["missing"].append(str(source))

        for translation in game.get("translations", []):
            t = dict(translation)
            # Tamanhos voltam a ser automáticos quando os arquivos vêm junto.
            for step in (t.get("install") or {}).get("steps", []):
                if step.get("type") != "downloadFile" or base is None:
                    continue
                url = step.get("file", "")
                if url.startswith(("http://", "https://")):
                    continue
                source = base / url
                parts = url.strip("/").split("/")
                if source.is_file() and len(parts) == 3 and parts[0] == "files":
                    target = store.file_folder(parts[1]) / store.safe_name(parts[2])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
                    report["files"] += 1
                    t["download_size"] = None
                elif not source.is_file():
                    report["missing"].append(str(source))
            record["translations"].append(t)
            report["translations"] += 1
        store.save_game(record)
        report["games"] += 1

    settings = {}
    if catalog.get("base_url"):
        settings["base_url"] = catalog["base_url"]
    if catalog.get("catalog_version"):
        settings["catalog_version"] = catalog["catalog_version"]
    store.save_settings(settings)
    return report
