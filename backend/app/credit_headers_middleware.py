"""
Middleware that attaches X-Credits-* headers to responses when credit_result is set.
"""
from starlette.middleware.base import BaseHTTPMiddleware


class CreditHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        credit_result = getattr(request.state, "credit_result", None)
        if credit_result and credit_result.get("remaining") is not None:
            response.headers["X-Credits-Remaining"] = str(credit_result["remaining"])
            if credit_result.get("deducted"):
                response.headers["X-Credits-Deducted"] = str(credit_result["deducted"])
            if credit_result.get("warning"):
                response.headers["X-Credits-Warning"] = credit_result["warning"]
        return response
