"""
Application errors.

Services raise these; a single handler in app/main.py turns them into JSON:

    {"detail": "<English message>", "code": "<machine code>", "params": {...}}

The frontend translates by `code` (with `params` for placeholders) and falls back to
`detail`, so error messages are shown in the user's language.
"""

from typing import Any, ClassVar


class AppError(Exception):
    status_code: ClassVar[int] = 400
    default_code: ClassVar[str] = "bad_request"
    default_message: ClassVar[str] = "The request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None, **params: Any):
        self.message = message or self.default_message
        self.code = code or self.default_code
        self.params = params
        super().__init__(self.message)


class UnauthorizedError(AppError):
    status_code = 401
    default_code = "not_authenticated"
    default_message = "You are not signed in, or your session has expired."


class ForbiddenError(AppError):
    status_code = 403
    default_code = "forbidden"
    default_message = "You do not have permission to do this."


class NotFoundError(AppError):
    status_code = 404
    default_code = "not_found"
    default_message = "The resource was not found."


class ConflictError(AppError):
    status_code = 409
    default_code = "conflict"
    default_message = "The request conflicts with existing data."


class PayloadTooLargeError(AppError):
    status_code = 413
    default_code = "payload_too_large"
    default_message = "The content is too large."


class InvalidInputError(AppError):
    status_code = 422
    default_code = "invalid_input"
    default_message = "The request contains invalid data."


class RangeNotSatisfiableError(AppError):
    status_code = 416
    default_code = "range_not_satisfiable"
    default_message = "The requested byte range is not valid for this file."


class BadGatewayError(AppError):
    status_code = 502
    default_code = "bad_gateway"
    default_message = "An upstream service returned an invalid response."


class ServiceUnavailableError(AppError):
    status_code = 503
    default_code = "service_unavailable"
    default_message = "A required service is not available."


class GatewayTimeoutError(AppError):
    status_code = 504
    default_code = "gateway_timeout"
    default_message = "An upstream service did not answer in time."
