from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["Citizen", "Helper", "Officer", "Admin"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Login(StrictModel):
    user_id: str = Field(min_length=1, max_length=100)
    password: str = Field(max_length=1024)


class LoginResult(StrictModel):
    access_token: str


class UserView(StrictModel):
    user_id: str = Field(min_length=1)
    role: Role
    workspace_id: str | None = Field(min_length=1)


class UserCreate(Login):
    password: str = Field(min_length=12, max_length=1024)
    role: Role
    workspace_id: str | None = Field(min_length=1)


class Health(StrictModel):
    status: Literal["ok"]
    simulated: Literal[True]


class Error(StrictModel):
    error: str
    detail: str
