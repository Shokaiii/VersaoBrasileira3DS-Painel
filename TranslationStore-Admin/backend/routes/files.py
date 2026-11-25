"""Arquivos das traduções (pacotes, CIAs...), enviados do computador."""
import shutil

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..models import media, store

router = APIRouter(prefix="/api/files", tags=["arquivos"])


@router.get("/{translation_id}")
def list_files(translation_id: str):
    try:
        return media.list_files(translation_id)
    except ValueError as error:
        raise HTTPException(400, str(error))


@router.post("/{translation_id}")
async def upload(translation_id: str, file: UploadFile = File(...)):
    try:
        folder = store.file_folder(translation_id)
        name = store.safe_name(file.filename)
    except ValueError as error:
        raise HTTPException(400, str(error))
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    with open(target, "wb") as handle:
        shutil.copyfileobj(file.file, handle, 1024 * 1024)
    return media.file_info(translation_id, target)


@router.delete("/{translation_id}/{name}")
def delete(translation_id: str, name: str):
    try:
        target = store.file_folder(translation_id) / store.safe_name(name)
    except ValueError as error:
        raise HTTPException(400, str(error))
    if target.exists():
        target.unlink()
    return {"ok": True}
