"""Configurações, validação, geração e importação do catálogo."""
import json
import os
import subprocess
import sys

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .. import paths
from ..catalog_generator import generator, importer
from ..models import store
from ..validators.validate import validate_all

router = APIRouter(prefix="/api", tags=["catálogo"])


@router.get("/settings")
def get_settings():
    settings = store.get_settings()
    settings["catalog_url_effective"] = store.catalog_url(settings)
    settings["output"] = str(paths.OUTPUT)
    settings["has_panel_key"] = bool(store.get_secret("panel_key"))
    return settings


@router.put("/settings")
def put_settings(values: dict):
    url = values.get("base_url", "")
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(400, "O endereço do servidor deve começar com http:// ou https://.")
    if "app_required" in values and values["app_required"] not in ("sim", "nao"):
        raise HTTPException(400, "Atualização obrigatória deve ser sim ou nao.")
    if "app_notes" in values and not isinstance(values["app_notes"], list):
        raise HTTPException(400, "As novidades devem ser uma lista.")
    key = values.pop("panel_key", None)
    if key is not None:
        key = str(key).strip()
        if key and len(key) < 32:
            raise HTTPException(400, "A chave do painel deve ter pelo menos 32 caracteres.")
        store.set_secret("panel_key", key)
    return store.save_settings(values)


@router.get("/validate")
def validate():
    games = store.list_games()
    settings = store.get_settings()
    problems = validate_all(games, settings) + generator.app_problems(settings)
    return {"problems": problems, "games": len(games)}


@router.get("/app")
def app_info():
    """Versão e arquivos compilados do aplicativo."""
    return generator.app_info()


@router.post("/generate")
def generate(values: dict):
    part = values.get("bump", "patch")
    if part not in ("patch", "minor", "major", "none"):
        raise HTTPException(400, "Tipo de versão inválido.")
    return generator.generate(part)


@router.get("/preview")
def preview():
    """O catalog.json como ficaria, sem gravar nada."""
    settings = store.get_settings()
    catalog, _, _ = generator.build_catalog(settings, settings["catalog_version"])
    return catalog


@router.post("/import")
async def import_catalog(file: UploadFile = File(...), folder: str = Form(""),
                         replace: bool = Form(False)):
    try:
        catalog = json.loads((await file.read()).decode("utf-8-sig"))
        return importer.import_catalog(catalog, folder.strip().strip('"'), replace)
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(400, str(error))


@router.post("/open-output")
def open_output():
    """Abre a pasta output/ no Explorador de Arquivos."""
    target = str(paths.OUTPUT)
    try:
        if sys.platform.startswith("win"):
            os.startfile(target)  # noqa: S606 - só abre a pasta local
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target])
        else:
            subprocess.Popen(["xdg-open", target])
    except OSError as error:
        raise HTTPException(500, str(error))
    return {"ok": True}
