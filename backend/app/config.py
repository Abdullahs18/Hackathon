from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DASTAK_", extra="ignore")

    database_url: str
    jwt_secret: SecretStr
    jwt_issuer: str = "dastak"
    jwt_audience: str = "dastak-api"
    access_token_minutes: int = Field(default=30, ge=1, le=120)
    cors_origins: list[str] = ["http://localhost:5173"]
    login_attempts_per_minute: int = Field(default=10, ge=1, le=100)
    demo_password: SecretStr | None = None

    @field_validator("jwt_secret")
    @classmethod
    def validate_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("JWT secret must contain at least 32 characters")
        return value

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith(("postgresql+psycopg://", "sqlite")):
            raise ValueError("Use postgresql+psycopg; SQLite is supported for local tests only")
        return value
