"""Pine Script API: save, list, compile, run."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.script import PineScript
from app.pine.compiler import compile_pine
from app.pine.runtime import run_indicator

router = APIRouter()


@router.get("/scripts")
async def list_scripts(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(PineScript).order_by(PineScript.updated_at.desc()))
    return [
        {"id": s.id, "name": s.name, "kind": s.kind, "version": s.version, "updated_at": s.updated_at.isoformat()}
        for s in result.scalars().all()
    ]


@router.post("/scripts")
async def save_script(payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    if "id" in payload and payload["id"]:
        s = await db.get(PineScript, int(payload["id"]))
        if not s:
            raise HTTPException(404, "Script not found")
        s.name = payload.get("name", s.name)
        s.source = payload["source"]
        s.kind = payload.get("kind", s.kind)
    else:
        s = PineScript(
            name=payload["name"],
            source=payload["source"],
            kind=payload.get("kind", "indicator"),
        )
        db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": s.id, "name": s.name}


@router.post("/compile")
def compile_script(payload: dict) -> dict:
    """Parse + compile Pine source and return diagnostics / compiled IR."""
    source = payload.get("source", "")
    try:
        ir = compile_pine(source)
        return {"ok": True, "ir": ir}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


@router.post("/run")
async def run_script(payload: dict) -> dict:
    """Run Pine indicator against loaded bars and return series for chart."""
    source = payload.get("source", "")
    bars = payload.get("bars", [])
    try:
        result = run_indicator(source, bars)
        return {"ok": True, "series": result}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
