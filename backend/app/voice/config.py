from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class VoiceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DASTAK_", extra="ignore")

    gemini_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "DASTAK_GEMINI_API_KEY")
    )
    gemini_model: str = ""
    voice_timeout_seconds: int = Field(default=45, ge=1, le=120)


class VoiceError(Exception):
    """Only public, constant messages belong here; never include provider exception text."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)
