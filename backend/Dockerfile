FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so this layer stays cached between code changes.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install -e .

COPY . .

RUN useradd --create-home appuser && chmod +x /app/entrypoint.sh && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["/app/entrypoint.sh"]
