import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.audit import audit

log = logging.getLogger("errors")
router = APIRouter(prefix="/errors", tags=["errors"])


class ClientErrorReport(BaseModel):
    type: str = "unknown"
    message: str = ""
    stack: str | None = None
    componentStack: str | None = None
    component: str | None = None
    filename: str | None = None
    lineno: int | None = None
    colno: int | None = None
    url: str | None = None
    timestamp: str | None = None


@router.post("")
async def report_client_error(report: ClientErrorReport, request: Request):
    user = getattr(request.state, "user", None) or {}
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")

    log.warning("Client error [%s]: %s (component=%s, url=%s)",
                report.type, report.message[:200], report.component, report.url)

    audit.log_client_error(
        error_type=report.type,
        message=report.message,
        stack=report.stack or report.componentStack,
        component=report.component,
        url=report.url,
        client_ip=client_ip,
        user_agent=request.headers.get("user-agent"),
        user_id=user.get("id"),
        username=user.get("username"),
    )

    return {"status": "recorded"}
