"""FastAPI entrypoint for pw-backtest backend."""
from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import health, data, replay, backtest, pine, paper, screener, ws, brokers
from app.models.database import init_db


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Personal replay & backtesting platform.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # localhost dev only
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def on_startup() -> None:
        await init_db()
        # paper trading heartbeat: keeps live sessions advancing with the UI closed
        app.state.paper_task = asyncio.create_task(paper.paper_loop())
        # websocket price hub poller
        ws.hub.start()

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        task = getattr(app.state, "paper_task", None)
        if task:
            task.cancel()
        ws.hub.stop()

    app.include_router(health.router, prefix="/api/health", tags=["health"])
    app.include_router(data.router, prefix="/api/data", tags=["data"])
    app.include_router(replay.router, prefix="/api/replay", tags=["replay"])
    app.include_router(backtest.router, prefix="/api/backtest", tags=["backtest"])
    app.include_router(pine.router, prefix="/api/pine", tags=["pine"])
    app.include_router(paper.router, prefix="/api/paper", tags=["paper"])
    app.include_router(screener.router, prefix="/api/screener", tags=["screener"])
    app.include_router(ws.router, prefix="/api/ws", tags=["ws"])
    app.include_router(brokers.router, prefix="/api/brokers", tags=["brokers"])

    @app.get("/")
    async def root():
        return {
            "name": settings.app_name,
            "status": "ok",
            "version": "0.1.0",
            "endpoints": ["/api/health", "/api/data", "/api/replay", "/api/backtest", "/api/pine", "/api/paper", "/api/screener", "/api/ws", "/api/brokers"],
        }

    return app


app = create_app()
