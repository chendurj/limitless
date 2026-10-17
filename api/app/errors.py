"""One error format for the web app: {"error": {"code", "message"}}."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.llm.client import LLMUnavailable

CODES = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT",
         429: "RATE_LIMITED", 501: "NOT_IMPLEMENTED"}  # fmt: skip


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def install(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return error(exc.status_code, CODES.get(exc.status_code, "ERROR"), str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        return error(422, "VALIDATION_ERROR", f"{where}: {first.get('msg', 'invalid request')}")

    @app.exception_handler(LLMUnavailable)
    async def llm_error(request: Request, exc: LLMUnavailable) -> JSONResponse:
        return error(502, "LLM_UNAVAILABLE", "The AI service did not answer. Try again.")
