"""Gera output/: catalog.json, version.json, images/ e files/, prontos para
enviar ao servidor (Especificação 01, §2 e §3)."""
import copy
import shutil
from datetime import datetime, timezone

from .. import paths
from ..models import media, store
from ..validators.validate import validate_all

STEP_FIELDS = ("type", "label", "optional", "file", "output", "source", "destination",
               "input", "sha256", "title_id", "overwrite", "missing_ok", "delete_after")


def bump(version: str, part: str) -> str:
    try:
        major, minor, patch = (int(x) for x in version.split("."))
    except ValueError:
        major, minor, patch = 1, 0, 0
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    if part == "patch":
        return f"{major}.{minor}.{patch + 1}"
    return f"{major}.{minor}.{patch}"


def clean_step(step: dict) -> dict:
    out = {}
    for key in STEP_FIELDS:
        value = step.get(key)
        if value in (None, ""):
            continue
        # Valores padrão não vão para o JSON.
        if (key, value) in (("optional", False), ("overwrite", True),
                            ("missing_ok", True), ("delete_after", True)):
            continue
        out[key] = value
    return out


def build_translation(translation: dict, used_files: set) -> dict:
    t = copy.deepcopy(translation)
    steps = [clean_step(s) for s in (t.get("install") or {}).get("steps", [])]
    auto_size = 0
    for step in steps:
        if step.get("type") != "downloadFile":
            continue
        local = media.local_file_for(step.get("file", ""))
        if local is not None:
            # sha256 e tamanho sempre calculados do arquivo enviado ao painel.
            step["sha256"] = media.sha256_of(local)
            auto_size += local.stat().st_size
            used_files.add(local)
    out = {
        "id": t["id"],
        "name": t["name"],
        "language": t.get("language") or "pt-BR",
        "version": t["version"],
    }
    for key in ("release_date", "description"):
        if t.get(key):
            out[key] = t[key]
    if t.get("authors"):
        out["authors"] = [{k: v for k, v in a.items() if v} for a in t["authors"] if a.get("name")]
    if t.get("changelog"):
        out["changelog"] = [c for c in t["changelog"] if c.get("version") or c.get("notes")]
    compat = t.get("compatibility") or {}
    out["compatibility"] = {
        "regions": compat.get("regions") or [],
        "game_versions": compat.get("game_versions") or [],
        "consoles": compat.get("consoles") or "all",
        "requirements": compat.get("requirements") or [],
        "notes": compat.get("notes") or "",
    }
    download = t.get("download_size")
    out["download_size"] = int(download) if download not in (None, "") else auto_size
    install = t.get("install_size")
    out["install_size"] = int(install) if install not in (None, "") else out["download_size"]
    out["install"] = {"steps": steps}
    uninstall = [clean_step(s) for s in (t.get("uninstall") or {}).get("steps", [])]
    if uninstall:
        out["uninstall"] = {"steps": uninstall}
    return out


def build_catalog(settings: dict, version: str) -> tuple[dict, set, list]:
    games = store.list_games()
    used_files = set()
    used_images = []
    catalog_games = []
    for game in games:
        entry = {
            "id": game["id"],
            "name": game["name"],
            "platform": game.get("platform", "3ds"),
        }
        for key in ("description", "publisher", "release_year", "genres"):
            if game.get(key):
                entry[key] = game[key]
        entry["title_ids"] = [t for t in game.get("title_ids", []) if t.get("id")]
        images = media.image_files(game["id"])
        entry["images"] = {}
        if images["icon"]:
            entry["images"]["icon"] = {"url": f"images/{game['id']}/icon.png",
                                       "sha256": media.sha256_of(images["icon"]),
                                       "width": paths.ICON_SIZE[0], "height": paths.ICON_SIZE[1]}
            used_images.append(images["icon"])
        if images["cover"]:
            entry["images"]["cover"] = {"url": f"images/{game['id']}/cover.jpg",
                                        "sha256": media.sha256_of(images["cover"]),
                                        "width": paths.COVER_SIZE[0], "height": paths.COVER_SIZE[1]}
            used_images.append(images["cover"])
        entry["translations"] = [build_translation(t, used_files)
                                 for t in game.get("translations", [])]
        catalog_games.append(entry)
    catalog = {
        "catalog_version": version,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_url": settings["base_url"],
        "games": catalog_games,
    }
    return catalog, used_files, used_images


# --- Aplicativo ----------------------------------------------------------------

def app_info() -> dict:
    """Versão do TranslationStore/VERSION e os arquivos compilados na raiz."""
    try:
        version = paths.APP_VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        version = ""
    version_time = paths.APP_VERSION_FILE.stat().st_mtime if version else 0
    files = {}
    for kind, path in (("3dsx", paths.APP_3DSX), ("cia", paths.APP_CIA)):
        if path.is_file():
            stat = path.stat()
            files[kind] = {
                "name": path.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M"),
                # Compilado antes da última mudança de versão.
                "outdated": stat.st_mtime < version_time,
            }
    return {"version": version, "files": files}


def app_problems(settings: dict) -> list:
    """Avisos e erros da publicação do aplicativo."""
    if not settings.get("app_publish"):
        return []
    info = app_info()
    problems = []
    if not info["version"]:
        problems.append({"level": "error", "where": "Aplicativo",
                         "message": f"Não encontrei a versão em {paths.APP_VERSION_FILE}."})
    if not info["files"]:
        problems.append({"level": "error", "where": "Aplicativo",
                         "message": "Nenhum VersaoBrasileira.3dsx ou .cia na pasta do projeto. Rode o compilar.bat."})
    for kind in ("3dsx", "cia"):
        file = info["files"].get(kind)
        if file is None and info["files"]:
            problems.append({"level": "warning", "where": "Aplicativo",
                             "message": f"Sem VersaoBrasileira.{kind}: quem usa esse formato não recebe a atualização."})
        elif file and file["outdated"]:
            problems.append({"level": "warning", "where": "Aplicativo",
                             "message": f"VersaoBrasileira.{kind} é mais antigo que o VERSION: compile de novo antes de publicar."})
    return problems


def build_app(settings: dict, out):
    """Copia o app para output/app/ e devolve o bloco "app" do version.json."""
    shutil.rmtree(out / "app", ignore_errors=True)
    if not settings.get("app_publish"):
        return None
    info = app_info()
    block = {
        "version": info["version"],
        "required": "sim" if settings.get("app_required") == "sim" else "nao",
    }
    notes = [n.strip() for n in settings.get("app_notes") or [] if n.strip()]
    if notes:
        block["notes"] = notes
    (out / "app").mkdir(parents=True, exist_ok=True)
    for kind, path in (("3dsx", paths.APP_3DSX), ("cia", paths.APP_CIA)):
        if kind in info["files"]:
            shutil.copy2(path, out / "app" / path.name)
            block[f"{kind}_url"] = settings["base_url"] + "app/" + path.name
            block[f"{kind}_sha256"] = media.sha256_of(path)
    return block


def generate(part: str = "patch") -> dict:
    settings = store.get_settings()
    problems = validate_all(store.list_games(), settings) + app_problems(settings)
    errors = [p for p in problems if p["level"] == "error"]
    if errors:
        return {"ok": False, "problems": problems}

    version = bump(settings["catalog_version"], part)
    catalog, used_files, used_images = build_catalog(settings, version)

    out = paths.OUTPUT
    for sub in ("images", "files"):
        shutil.rmtree(out / sub, ignore_errors=True)
    for image in used_images:
        target = out / "images" / image.parent.name / image.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, target)
    for file in used_files:
        target = out / "files" / file.parent.name / file.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)

    store.write_json(out / "catalog.json", catalog)
    version_json = {
        "catalog_version": version,
        "catalog_url": store.catalog_url(settings),
        "published_at": catalog["generated_at"],
    }
    app = build_app(settings, out)
    if app:
        version_json["app"] = app
    store.write_json(out / "version.json", version_json)
    store.save_settings({"catalog_version": version, "last_generated": catalog["generated_at"]})
    return {
        "ok": True,
        "problems": problems,
        "version": version,
        "games": len(catalog["games"]),
        "translations": sum(len(g["translations"]) for g in catalog["games"]),
        "images": len(used_images),
        "files": len(used_files),
        "app": app["version"] if app else "",
        "output": str(out),
    }
