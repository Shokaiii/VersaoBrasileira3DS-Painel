"""Mensagens do Contato: o painel lê da API do servidor (mensagens.php)."""
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException

from ..models import store

router = APIRouter(prefix="/api/messages")

KINDS = {"erro": "Erro numa tradução", "pedido": "Pedido de tradução", "outro": "Outro assunto"}


def call(method: str, query: str = "", body: dict | None = None) -> dict:
    key = store.get_secret("panel_key")
    if not key:
        raise HTTPException(400, "Informe a chave do painel em Configurações → Servidor.")
    url = store.get_settings()["base_url"] + "api/mensagens.php" + query
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={
        "X-Painel-Chave": key,
        "Content-Type": "application/json",
        "User-Agent": "VersaoBrasileira-Painel",
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as answer:
            return json.loads(answer.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            message = json.loads(error.read().decode("utf-8")).get("error")
        except Exception:
            message = None
        raise HTTPException(502, message or f"O servidor respondeu com erro {error.code}.")
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise HTTPException(502, f"Não foi possível falar com o servidor: {error}")


@router.get("")
def list_messages():
    answer = call("GET", "?desde=0")
    items = answer.get("items", [])
    for item in items:
        item["kind_label"] = KINDS.get(item.get("kind"), item.get("kind"))
    items.sort(key=lambda item: item.get("id", 0), reverse=True)
    return {"items": items, "unread": sum(1 for item in items if not item.get("read_at"))}


@router.post("/{message_id}/read")
def mark_read(message_id: int):
    call("POST", body={"lida": message_id})
    return {"ok": True}


@router.delete("/{message_id}")
def delete_message(message_id: int):
    call("POST", body={"apagar": message_id})
    return {"ok": True}
