"""Imagens (recorte e redimensionamento) e arquivos das traduções."""
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageOps

from .. import paths
from . import store


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def image_files(game_id: str) -> dict:
    """{"icon": Path|None, "cover": Path|None}"""
    folder = paths.IMAGES / game_id
    icon = folder / "icon.png"
    cover = folder / "cover.jpg"
    return {"icon": icon if icon.exists() else None,
            "cover": cover if cover.exists() else None}


def process_image(data: bytes, kind: str, mode: str = "fill",
                  crop: dict | None = None) -> Image.Image:
    """Ajusta a imagem ao tamanho do aplicativo.

    mode "fill": recorta o centro para preencher (sem bordas);
    mode "fit": cabe inteira, com bordas da cor do canto;
    crop: {"x","y","w","h"} em frações 0..1 da imagem original, aplicado antes.
    """
    size = paths.ICON_SIZE if kind == "icon" else paths.COVER_SIZE
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGBA")
    if crop:
        w, h = image.size
        left = max(0, min(w - 1, round(float(crop.get("x", 0)) * w)))
        top = max(0, min(h - 1, round(float(crop.get("y", 0)) * h)))
        right = max(left + 1, min(w, round((float(crop.get("x", 0)) + float(crop.get("w", 1))) * w)))
        bottom = max(top + 1, min(h, round((float(crop.get("y", 0)) + float(crop.get("h", 1))) * h)))
        image = image.crop((left, top, right, bottom))
    # Transparência vira branco: o 3DS desenha essas imagens sem alfa.
    flat = Image.new("RGBA", image.size, (255, 255, 255, 255))
    flat.alpha_composite(image)
    image = flat.convert("RGB")
    if mode == "fit":
        corner = image.getpixel((0, 0))
        fitted = ImageOps.contain(image, size, Image.LANCZOS)
        canvas = Image.new("RGB", size, corner)
        canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
        return canvas
    return ImageOps.fit(image, size, Image.LANCZOS)


def save_image(game_id: str, kind: str, data: bytes, mode: str = "fill",
               crop: dict | None = None) -> Path:
    store.game_path(game_id)  # valida o id
    image = process_image(data, kind, mode, crop)
    folder = paths.IMAGES / game_id
    folder.mkdir(parents=True, exist_ok=True)
    if kind == "icon":
        target = folder / "icon.png"
        image.save(target, "PNG", optimize=True)
    else:
        target = folder / "cover.jpg"
        image.save(target, "JPEG", quality=90, optimize=True)
    return target


def delete_image(game_id: str, kind: str) -> None:
    file = image_files(game_id)[kind]
    if file:
        file.unlink()


def list_files(translation_id: str) -> list:
    folder = store.file_folder(translation_id)
    if not folder.exists():
        return []
    out = []
    for file in sorted(folder.iterdir()):
        if file.is_file():
            out.append(file_info(translation_id, file))
    return out


def file_info(translation_id: str, file: Path) -> dict:
    info = {
        "name": file.name,
        "size": file.stat().st_size,
        "sha256": sha256_of(file),
        "server_path": f"files/{translation_id}/{file.name}",
    }
    if file.suffix.lower() == ".cia":
        info["cia_title_id"] = cia_title_id(file)
    return info


def _align(value: int, to: int = 64) -> int:
    return (value + to - 1) // to * to


# Tamanho da assinatura (com preenchimento) por tipo, no início do TMD.
_SIGNATURE_SIZES = {
    0x010000: 0x200 + 0x3C, 0x010001: 0x100 + 0x3C, 0x010002: 0x3C + 0x40,
    0x010003: 0x200 + 0x3C, 0x010004: 0x100 + 0x3C, 0x010005: 0x3C + 0x40,
}


def cia_title_id(file: Path) -> str | None:
    """Title ID (16 dígitos) gravado no TMD do arquivo .cia, ou None."""
    try:
        with open(file, "rb") as handle:
            header = handle.read(0x20)
            if len(header) < 0x20:
                return None
            header_size = int.from_bytes(header[0:4], "little")
            cert_size = int.from_bytes(header[8:12], "little")
            ticket_size = int.from_bytes(header[12:16], "little")
            tmd_size = int.from_bytes(header[16:20], "little")
            if header_size != 0x2020 or tmd_size == 0:
                return None
            tmd = _align(header_size) + _align(cert_size) + _align(ticket_size)
            handle.seek(tmd)
            kind = int.from_bytes(handle.read(4), "big")
            signature = _SIGNATURE_SIZES.get(kind)
            if signature is None:
                return None
            handle.seek(tmd + 4 + signature + 0x4C)
            raw = handle.read(8)
            if len(raw) != 8:
                return None
            return raw.hex().upper()
    except OSError:
        return None


def local_file_for(step_file: str) -> Path | None:
    """Arquivo local de um downloadFile relativo ("files/<tid>/<nome>")."""
    parts = (step_file or "").strip("/").split("/")
    if len(parts) == 3 and parts[0] == "files":
        try:
            folder = store.file_folder(parts[1])
            candidate = folder / store.safe_name(parts[2])
        except ValueError:
            return None
        if candidate.is_file():
            return candidate
    return None
