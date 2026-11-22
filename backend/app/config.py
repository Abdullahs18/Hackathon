import re
from ipaddress import ip_network
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="DASTAK_", extra="ignore", hide_input_in_errors=True
    )

    database_url: str = Field(repr=False)
    jwt_secret: SecretStr
    jwt_issuer: str = "dastak"
    jwt_audience: str = "dastak-api"
    access_token_minutes: int = Field(default=30, ge=1, le=120)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    login_attempts_per_minute: int = Field(default=10, ge=1, le=100)
    demo_password: SecretStr | None = None
    evidence_dir: Path = Path("storage/evidence")
    evidence_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=10 * 1024 * 1024)
    environment: Literal["development", "production"] = "development"
    storage_backend: Literal["local", "supabase"] = "local"
    supabase_url: str | None = None
    supabase_service_key: SecretStr | None = None
    supabase_bucket: str = "dastak-private"
    database_pool_size: int = Field(default=5, ge=1, le=10)
    database_max_overflow: int = Field(default=10, ge=0, le=10)
    trusted_proxy_ips: list[str] = []

    @field_validator("trusted_proxy_ips")
    @classmethod
    def validate_proxy_ips(cls, values):
        for value in values:
            network = ip_network(value, strict=False)
            if network.prefixlen == 0:
                raise ValueError("Proxy trust must be restricted to known proxy networks")
        return values

    @field_validator("jwt_secret")
    @classmethod
    def validate_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("JWT secret must contain at least 32 characters")
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("Database URL must be a string")
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                value = "postgresql+psycopg://" + value[len(prefix) :]
                break
        if not value.startswith(("postgresql+psycopg://", "sqlite")):
            raise ValueError("Use postgresql+psycopg; SQLite is supported for local tests only")
        return value

    @model_validator(mode="after")
    def validate_deployment(self):
        from sqlalchemy.engine import make_url

        if self.storage_backend == "supabase":
            parsed = urlsplit(self.supabase_url or "")
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path not in ("", "/")
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("Supabase storage requires an HTTPS project origin")
            if (
                not self.supabase_service_key
                or not self.supabase_service_key.get_secret_value().strip()
            ):
                raise ValueError("Supabase storage requires a server-side service key")
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", self.supabase_bucket):
                raise ValueError("Use a lowercase storage bucket identifier")
        if self.environment == "production":
            url = make_url(self.database_url)
            if url.drivername != "postgresql+psycopg" or url.query.get("sslmode") not in {
                "require",
                "verify-ca",
                "verify-full",
            }:
                raise ValueError("Production requires PostgreSQL with SSL enabled")
            if (
                url.host
                and (url.host.endswith(".pooler.supabase.com") or url.host.endswith(".supabase.co"))
                and url.port == 6543
            ):
                raise ValueError(
                    "Use the Supabase session pooler or direct connection on port 5432; "
                    "startup requires session-level advisory locks"
                )
            if self.storage_backend != "supabase":
                raise ValueError("Production requires persistent private Supabase storage")
            for origin in self.cors_origins:
                parsed = urlsplit(origin)
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or parsed.path
                    or parsed.query
                    or parsed.fragment
                    or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
                ):
                    raise ValueError("Production CORS origins must be exact public HTTPS origins")
            if not self.cors_origins:
                raise ValueError("Production requires an allowed frontend origin")
        return self
