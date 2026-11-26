"""Painel administrativo do Versão Brasileira.

Roda só no computador (127.0.0.1) e gera os arquivos do catálogo.
Para iniciar: iniciar_painel.bat na raiz do projeto, ou
    python -m uvicorn backend.main:app --port 8765
"""
import os
import threading
import webbrowser

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import paths
from .routes import catalog, files, games, messages

app = FastAPI(title="Versão Brasileira — Painel", docs_url="/api/docs")
app.include_router(games.router)
app.include_router(files.router)
app.include_router(catalog.router)
app.include_router(messages.router)
app.mount("/media/images", StaticFiles(directory=paths.IMAGES), name="images")
app.mount("/static", StaticFiles(directory=paths.FRONTEND), name="static")


@app.middleware("http")
async def always_fresh(request: Request, call_next):
    """O navegador sempre confere se o painel (HTML, JS, CSS) mudou, para
    uma versão nova aparecer sem precisar limpar o cache."""
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(paths.FRONTEND / "index.html",
                        headers={"Cache-Control": "no-store"})


@app.on_event("startup")
def open_browser():
    url = os.environ.get("ABRIR_NAVEGADOR")
    if url:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
