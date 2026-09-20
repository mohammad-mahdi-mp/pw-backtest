"""Application configuration."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]  # backend/
ROOT_DIR = BASE_DIR.parent                        # repo root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "pw-backtest"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    data_dir: Optional[Path] = None
    db_url: Optional[str] = None

    @field_validator("data_dir", "db_url", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v
    # Brokers
    oanda_api_key: str = ""
    oanda_account_id: str = ""
    oanda_env: str = "practice"
    ibkr_host: str = "127.0.0.1"
    ibkr_port: int = 7497
    ibkr_client_id: int = 1

    # Defaults
    default_cash: float = 100_000.0


settings = Settings()
# Fall back to repo-root paths when not configured via env
if not settings.data_dir:
    settings.data_dir = ROOT_DIR / "data"
if not settings.db_url:
    settings.db_url = f"sqlite:///{ROOT_DIR / 'data' / 'db.sqlite3'}"
settings.data_dir.mkdir(parents=True, exist_ok=True)
