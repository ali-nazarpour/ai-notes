"""
Client for Ollama's HTTP API (POST /api/chat).

Network and HTTP problems are turned into AppError subclasses with stable codes, so the
user sees a clear, translated message and never a stack trace. Only metadata is logged
(model, sizes, duration), never the text itself.
"""

import logging
import re
import time
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import BadGatewayError, GatewayTimeoutError, ServiceUnavailableError

logger = logging.getLogger(__name__)

Message = dict[str, str]

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class OllamaUnavailableError(ServiceUnavailableError):
    default_code = "ollama_unavailable"
    default_message = "Cannot connect to Ollama. Make sure Ollama is running on the host machine."


class ModelNotFoundError(ServiceUnavailableError):
    default_code = "model_not_found"
    default_message = "The configured AI model is not installed in Ollama."


class AiTimeoutError(GatewayTimeoutError):
    default_code = "ai_timeout"
    default_message = "The AI model took too long to respond."


class AiBadResponseError(BadGatewayError):
    default_code = "ai_bad_response"
    default_message = "The AI model returned a response that could not be used."


class OllamaClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.model = settings.ollama_model
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._temperature = settings.ollama_temperature
        self._num_ctx = settings.ollama_num_ctx
        self._transport = transport
        self._timeout = httpx.Timeout(
            connect=5.0, read=settings.ollama_timeout_seconds, write=10.0, pool=5.0
        )

    def _http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url, timeout=self._timeout, transport=self._transport
        )

    async def complete(self, system: str, user: str, **options: Any) -> str:
        """Single-turn helper: a system prompt and one user message."""
        return await self.chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}], **options
        )

    async def chat(
        self,
        messages: list[Message],
        *,
        think: bool = False,
        temperature: float | None = None,
        schema: dict[str, Any] | None = None,
    ) -> str:
        """
        Sends a conversation and returns the assistant's reply.

        think=True lets reasoning models think before answering (slower, often more
        accurate). Models without that ability are retried once with thinking off.
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "think": think,
            "options": {
                "temperature": self._temperature if temperature is None else temperature,
                "num_ctx": self._num_ctx,
            },
        }
        if schema is not None:
            # Structured output: Ollama constrains the reply to this JSON schema.
            payload["format"] = schema
        started = time.perf_counter()
        response = await self._post(payload)
        if think and response.status_code == 400 and "think" in response.text.lower():
            logger.info("Model %s does not support thinking; retrying without it", self.model)
            payload["think"] = False
            response = await self._post(payload)

        if response.status_code == 404:
            logger.error("Ollama model not found: %s", self.model)
            raise ModelNotFoundError(
                f"The model '{self.model}' is not installed in Ollama. "
                "Run `ollama list` and set OLLAMA_MODEL to an installed tag.",
                model=self.model,
            )
        if response.status_code >= 400:
            logger.error("Ollama returned HTTP %s", response.status_code)
            raise AiBadResponseError("Ollama returned an unexpected error.")

        try:
            content = response.json()["message"]["content"]
        except (ValueError, KeyError, TypeError) as exc:
            raise AiBadResponseError() from exc

        answer = _THINK_BLOCK.sub("", str(content)).strip()
        if not answer:
            raise AiBadResponseError("The AI model returned an empty response.")

        logger.info(
            "Ollama chat ok model=%s messages=%d prompt_chars=%d answer_chars=%d "
            "think=%s secs=%.1f",
            self.model,
            len(messages),
            sum(len(m["content"]) for m in messages),
            len(answer),
            payload["think"],
            time.perf_counter() - started,
        )
        return answer

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        try:
            async with self._http() as http:
                return await http.post("/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            logger.warning("Ollama request timed out (model=%s)", self.model)
            raise AiTimeoutError() from exc
        except httpx.TransportError as exc:
            logger.error("Cannot reach Ollama at %s (%s)", self._base_url, type(exc).__name__)
            raise OllamaUnavailableError() from exc

    async def check_status(self) -> tuple[bool, bool, str]:
        """(ollama_reachable, model_available, detail). Never raises."""
        try:
            async with self._http() as http:
                response = await http.get("/api/tags", timeout=5.0)
                response.raise_for_status()
                installed = [m.get("name", "") for m in response.json().get("models", [])]
        except (httpx.HTTPError, ValueError, AttributeError):
            return False, False, "Cannot connect to Ollama. Make sure it is running."
        if self.model in installed:
            return True, True, "Ollama is reachable and the model is installed."
        return True, False, f"Ollama is reachable but the model '{self.model}' is not installed."
