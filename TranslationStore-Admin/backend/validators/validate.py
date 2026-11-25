"""Validação dos cadastros: JSON Schema + as mesmas regras do aplicativo
(Especificação 01, §4.4). Retorna problemas como
{"level": "error"|"warning", "where": "...", "message": "..."}."""
import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

from .. import paths
from ..models import media

SCHEMA = json.loads((Path(__file__).parent / "schemas" / "game.schema.json").read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)

# Igual a ops::checkWritePath no aplicativo.
PROTECTED = (
    "sdmc:/nintendo 3ds",
    "sdmc:/boot.firm",
    "sdmc:/boot.3dsx",
    "sdmc:/luma/config.bin",
    "sdmc:/3ds/versaobrasileira/config.json",
    "sdmc:/3ds/versaobrasileira/favorites.json",
    "sdmc:/3ds/versaobrasileira/catalog/",
    "sdmc:/3ds/versaobrasileira/installed/",
)
FIELD_NAMES = {
    "file": "Arquivo", "output": "Destino", "source": "Origem",
    "destination": "Destino", "input": "Subpasta", "title_id": "Title ID",
}


def check_read_path(path: str) -> str:
    if not path.startswith("sdmc:/"):
        return "deve começar com sdmc:/"
    if "\\" in path or "/../" in path or path.endswith("/..") or path.startswith("../"):
        return "não pode ter \\ nem .."
    return ""


def check_write_path(path: str) -> str:
    """Gravar (baixar, extrair, copiar). A raiz do SD é permitida; no 3DS,
    cada arquivo extraído ainda é conferido contra as áreas protegidas."""
    problem = check_read_path(path)
    if problem:
        return problem
    low = path.lower()
    if any(low.startswith(p) for p in PROTECTED):
        return "é uma área protegida do cartão SD"
    return ""


# Pastas que nunca podem ser apagadas inteiras (igual a ops::checkDeletePath).
UNDELETABLE = ("sdmc:/", "sdmc:/luma/", "sdmc:/luma", "sdmc:/3ds/", "sdmc:/3ds",
               "sdmc:/luma/titles/", "sdmc:/luma/titles")


# Parte alta do Title ID que o app aceita desinstalar (igual a
# ops::checkUninstallTitle): jogo, demo, atualização e DLC.
UNINSTALLABLE = ("00040000", "00040002", "0004000E", "0004008C")


def check_delete_path(path: str) -> str:
    problem = check_write_path(path)
    if problem:
        return problem
    if path.lower() in UNDELETABLE:
        return "não pode ser apagado (pasta do sistema inteira)"
    return ""


def check_url(url: str) -> str:
    if url.startswith(("http://", "https://")):
        return ""
    if re.match(r"^[A-Za-z0-9._~/-]+$", url) and ".." not in url:
        return ""  # relativo ao base_url
    return "deve ser um endereço http(s) ou um caminho relativo ao servidor"


def _schema_message(error) -> str:
    where = "/".join(str(p) for p in error.absolute_path)
    message = error.message
    if error.validator == "required":
        field = message.split("'")[1] if "'" in message else message
        message = f"campo obrigatório ausente: {FIELD_NAMES.get(field, field)}"
    elif error.validator == "pattern":
        message = f"formato inválido: {error.instance!r}"
    elif error.validator == "enum":
        message = f"valor não permitido: {error.instance!r}"
    elif error.validator == "minLength":
        message = "não pode ficar vazio"
    return (where, message)


def validate_steps(steps: list, where: str, problems: list, uninstall: bool = False) -> None:
    for index, step in enumerate(steps or [], start=1):
        here = f"{where}, etapa {index}"
        kind = step.get("type")

        def bad(field, reason):
            problems.append({"level": "error", "where": here,
                             "message": f"{FIELD_NAMES.get(field, field)} {reason}"})

        if kind == "downloadFile":
            if step.get("file") and check_url(step["file"]):
                bad("file", check_url(step["file"]))
            if step.get("output") and check_write_path(step["output"]):
                bad("output", check_write_path(step["output"]))
            if (step.get("file") and not step["file"].startswith(("http://", "https://"))
                    and media.local_file_for(step["file"]) is None):
                problems.append({"level": "warning", "where": here,
                                 "message": f"o arquivo {step['file']} não foi enviado ao painel; "
                                            "ele precisa existir no servidor"})
        elif kind == "extractFile":
            if step.get("file") and check_read_path(step["file"]):
                bad("file", check_read_path(step["file"]))
            if step.get("output") and check_write_path(step["output"]):
                bad("output", check_write_path(step["output"]))
            elif step.get("output", "").lower() in ("sdmc:/", "sdmc:"):
                problems.append({"level": "warning", "where": here,
                                 "message": "extrai na raiz do cartão SD: confira se as pastas "
                                            "dentro do arquivo estão certas (o 3DS recusa o pacote "
                                            "se ele tentar gravar em áreas protegidas)"})
        elif kind == "copyFile":
            if step.get("source") and check_read_path(step["source"]):
                bad("source", check_read_path(step["source"]))
            if step.get("destination") and check_write_path(step["destination"]):
                bad("destination", check_write_path(step["destination"]))
        elif kind == "deleteFile":
            if step.get("file") and check_delete_path(step["file"]):
                bad("file", check_delete_path(step["file"]))
        elif kind == "installCia":
            if step.get("file") and check_read_path(step["file"]):
                bad("file", check_read_path(step["file"]))
        elif kind == "uninstallCia":
            title = (step.get("title_id") or "").upper()
            if re.match(r"^[0-9A-F]{16}$", title) and title[:8] not in UNINSTALLABLE:
                bad("title_id", "é de um título do sistema (só jogos, atualizações, DLCs "
                                "e demos podem ser desinstalados)")


def validate_game(game: dict, problems: list, translation_ids: dict | None = None) -> None:
    name = game.get("name") or game.get("id") or "?"
    for error in sorted(VALIDATOR.iter_errors(game), key=lambda e: list(e.absolute_path)):
        where, message = _schema_message(error)
        problems.append({"level": "error", "where": f"{name}: {where or 'jogo'}", "message": message})

    images = media.image_files(game.get("id", "")) if game.get("id") else {}
    if not images.get("icon"):
        problems.append({"level": "warning", "where": name, "message": "sem ícone"})
    if not images.get("cover"):
        problems.append({"level": "warning", "where": name, "message": "sem capa"})
    elif media.image_size(images["cover"]) != paths.COVER_SIZE:
        width, height = media.image_size(images["cover"])
        problems.append({"level": "error", "where": name,
                         "message": f"capa no tamanho antigo ({width}×{height}): envie a capa "
                                    f"de novo no formato 3:2 ({paths.COVER_SIZE[0]}×{paths.COVER_SIZE[1]})"})
    if not game.get("translations"):
        problems.append({"level": "warning", "where": name, "message": "nenhuma tradução cadastrada"})

    for translation in game.get("translations", []):
        tid = translation.get("id", "")
        where = f"{name} › {translation.get('name') or tid}"
        if translation_ids is not None and tid:
            if tid in translation_ids:
                problems.append({"level": "error", "where": where,
                                 "message": f"identificador repetido (também usado em {translation_ids[tid]})"})
            translation_ids[tid] = name
        steps = (translation.get("install") or {}).get("steps") or []
        if not steps:
            problems.append({"level": "error", "where": where, "message": "sem etapas de instalação"})
        validate_steps(steps, f"{where} (instalação)", problems)
        validate_steps((translation.get("uninstall") or {}).get("steps") or [],
                       f"{where} (desinstalação)", problems, uninstall=True)


def validate_all(games: list, settings: dict) -> list:
    problems = []
    if not settings.get("base_url", "").startswith(("http://", "https://")):
        problems.append({"level": "error", "where": "Configurações",
                         "message": "o endereço do servidor deve começar com http:// ou https://"})
    if not re.match(r"^\d+\.\d+\.\d+$", settings.get("catalog_version", "")):
        problems.append({"level": "error", "where": "Configurações",
                         "message": "versão do catálogo inválida (use 1.2.3)"})
    translation_ids = {}
    seen_games = set()
    for game in games:
        if game.get("id") in seen_games:
            problems.append({"level": "error", "where": game.get("name", "?"),
                             "message": "identificador de jogo repetido"})
        seen_games.add(game.get("id"))
        validate_game(game, problems, translation_ids)
    if not games:
        problems.append({"level": "warning", "where": "Catálogo", "message": "nenhum jogo cadastrado"})
    return problems
