"""
Pydantic request/response models for auth, user management, and admin endpoints.
"""
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
import re


class LoginRequest(BaseModel):
    username: str = ""
    password: str = ""
    captcha_token: str = ""
    captcha_answer: str = ""


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str = ""


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: str
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.match(r"^[a-z0-9._-]{3,32}$", v):
            raise ValueError("Username must be 3-32 characters: lowercase letters, digits, dots, underscores, hyphens")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class TempPasswordChangeRequest(BaseModel):
    username: str
    temp_password: str
    new_password: str = Field(min_length=8)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.lower().strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: str
    display_name: str = Field(min_length=1, max_length=100)
    role: str = "analyst"
    password: str = Field(min_length=8)
    force_password_change: bool = True

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.match(r"^[a-z0-9._-]{3,32}$", v):
            raise ValueError("Username must be 3-32 characters: lowercase letters, digits, dots, underscores, hyphens")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("admin", "analyst"):
            raise ValueError("Role must be 'admin' or 'analyst'")
        return v


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role: str | None = None
    status: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.lower().strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ("admin", "analyst"):
            raise ValueError("Role must be 'admin' or 'analyst'")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("active", "disabled"):
            raise ValueError("Status must be 'active' or 'disabled'")
        return v


class CreateApiKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expires_in_days: int | None = None


class UpdateConfigRequest(BaseModel):
    password_policy: dict | None = None
    session_policy: dict | None = None
    lockout_policy: dict | None = None


class RevokeAllSessionsRequest(BaseModel):
    include_current: bool = False


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    role: str
    status: str
    last_login_at: datetime | None = None
    created_at: datetime | None = None
    password_changed_at: datetime | None = None
    password_expires_at: datetime | None = None
    force_password_change: bool = False


class SessionResponse(BaseModel):
    id: str
    created_at: datetime
    last_refreshed_at: datetime
    expires_at: datetime
    ip_address: str
    device_label: str | None = None
    is_current: bool = False


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    status: str
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
