"""Jogos, traduções e imagens."""
import json
import time

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..models import media, store
from ..validators.validate import validate_game

router = APIRouter(prefix="/api/games", tags=["jogos"])


def summary(game: dict) -> dict:
    images = media.image_files(game["id"])
    stamp = int(time.time())
    return {
        "id": game["id"],
        "name": game.get("name", ""),
        "platform": game.get("platform", ""),
        "translations": len(game.get("translations", [])),
        "icon": f"/media/images/{game['id']}/icon.png?t={stamp}" if images["icon"] else None,
    }


def with_images(game: dict) -> dict:
    images = media.image_files(game["id"])
    stamp = int(time.time() * 1000)
    out = dict(game)
    out["_images"] = {
        "icon": f"/media/images/{game['id']}/icon.png?t={stamp}" if images["icon"] else None,
        "cover": f"/media/images/{game['id']}/cover.jpg?t={stamp}" if images["cover"] else None,
    }
    return out


def clean(game: dict) -> dict:
    return {k: v for k, v in game.items() if not k.startswith("_")}


@router.get("")
def list_games():
    return [summary(g) for g in store.list_games()]


@router.get("/{game_id}")
def get_game(game_id: str):
    try:
        game = store.get_game(game_id)
    except ValueError as error:
        raise HTTPException(400, str(error))
    if game is None:
        raise HTTPException(404, "Jogo não encontrado.")
    return with_images(game)


@router.post("")
def create_game(game: dict):
    game = clean(game)
    try:
        if store.get_game(game.get("id", "")) is not None:
            raise HTTPException(409, "Já existe um jogo com esse identificador.")
    except ValueError as error:
        raise HTTPException(400, str(error))
    game.setdefault("platform", "3ds")
    game.setdefault("title_ids", [])
    game.setdefault("translations", [])
    store.save_game(game)
    return with_images(game)


@router.put("/{game_id}")
def update_game(game_id: str, game: dict):
    game = clean(game)
    if game.get("id") != game_id:
        raise HTTPException(400, "O identificador do jogo não pode ser alterado.")
    try:
        if store.get_game(game_id) is None:
            raise HTTPException(404, "Jogo não encontrado.")
    except ValueError as error:
        raise HTTPException(400, str(error))
    # Identificadores de tradução não podem repetir em outro jogo.
    ids = {t.get("id") for t in game.get("translations", [])}
    if len(ids) != len(game.get("translations", [])):
        raise HTTPException(400, "Duas traduções deste jogo têm o mesmo identificador.")
    for other in store.list_games():
        if other["id"] == game_id:
            continue
        for t in other.get("translations", []):
            if t.get("id") in ids:
                raise HTTPException(409, f"A tradução '{t['id']}' já existe no jogo {other['name']}.")
    store.save_game(game)
    problems = []
    validate_game(game, problems)
    result = with_images(game)
    result["_problems"] = problems
    return result


@router.delete("/{game_id}")
def delete_game(game_id: str):
    try:
        store.delete_game(game_id)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return {"ok": True}


@router.post("/{game_id}/images/{kind}")
async def upload_image(game_id: str, kind: str, file: UploadFile = File(...),
                       mode: str = Form("fill"), crop: str = Form("")):
    if kind not in ("icon", "cover"):
        raise HTTPException(400, "Tipo de imagem inválido.")
    data = await file.read()
    try:
        media.save_image(game_id, kind, data, mode, json.loads(crop) if crop else None)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception as error:  # imagem corrompida, formato desconhecido...
        raise HTTPException(400, f"Não foi possível abrir a imagem: {error}")
    return with_images(store.get_game(game_id) or {"id": game_id})["_images"]


@router.delete("/{game_id}/images/{kind}")
def delete_image(game_id: str, kind: str):
    if kind not in ("icon", "cover"):
        raise HTTPException(400, "Tipo de imagem inválido.")
    media.delete_image(game_id, kind)
    return {"ok": True}
