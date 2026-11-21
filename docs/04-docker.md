# 4. Docker and deployment

## Commands

```bash
docker compose up --build -d      # build and start
docker compose ps                 # status and health
docker compose logs -f backend    # follow logs
docker compose down               # stop (data volumes are kept)
```

Named volumes hold the database (`postgres_data`), uploads (`minio_data`), and pgAdmin
accounts and settings (`pgadmin_data`). `docker compose down -v` deletes these volumes.

## Images

- **backend** – `python:3.13-slim`, runtime dependencies only, runs as a non-root user.
  `entrypoint.sh` applies migrations and starts uvicorn.
- **frontend** – multi-stage: Node 22 builds the app (type check, Vite, service worker), then
  `nginx:1.27-alpine` serves `dist/`.
- **minio** – `cgr.dev/chainguard/minio:latest` (the official image is no longer published on
  Docker Hub). It is distroless, so it has no shell-based health check; the backend creates
  the bucket lazily and reports `storage_unavailable` (503) if MinIO is down.

## nginx

`frontend/nginx.conf`:

- proxies `/api/` to `backend:8000` with streaming (no request/response buffering) and
  10-minute timeouts for slow local models;
- allows uploads up to 600 MB (keep in line with `UPLOAD_MAX_VIDEO_BYTES`);
- serves `sw.js` and `manifest.webmanifest` with `no-cache` so updates are picked up, and
  hashed `/assets/` as immutable;
- falls back to `index.html` for client-side routes.

## Network exposure

Traefik reads its entry points from `docker/traefik/traefik.yaml` and its routes from
`docker/traefik/routes/`. Published ports bind to `127.0.0.1`.

| URL | Service |
| --- | --- |
| `http://ai-notes.localhost` | Default AI Notes address via Traefik and nginx |
| `http://localhost:5173` | Alternate AI Notes address |
| `http://localhost:5050` | pgAdmin via Traefik |
| `http://localhost:8080/dashboard/` | Traefik dashboard |
| `http://localhost:8000` | Direct API for local development |

PostgreSQL and MinIO are reachable inside the Compose network. To use the MinIO console
locally, add `ports: ["127.0.0.1:9101:9001"]` to the `minio` service.

To use a different `*.localhost` name, update the `Host` rule for `notes-domain` in
`docker/traefik/routes/local.yaml` and set `APP_URL` and `CORS_ORIGINS` in `.env` to
include the new address. If the admin panel already has an App URL saved, update it there
as well. Apply the changes with `docker compose up -d`.

## pgAdmin

Set `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` in `.env` before the first
startup. Use those values to sign in to pgAdmin. Compose pre-registers **AI Notes
PostgreSQL** at `db:5432` with `POSTGRES_DB` and `POSTGRES_USER` from `.env`.
Enter `POSTGRES_PASSWORD` when pgAdmin prompts for the database password.

The initial login and server registration are applied when `pgadmin_data` is first
created. Use pgAdmin to change an existing account's password or server settings.

## Ollama

Ollama runs in the `ollama` service (image `ollama/ollama`, same version as the desktop
app), so only Docker is needed. The backend reaches it at `http://ollama:11434` inside the
Compose network; it has no published port.

The model files are a bind mount of `OLLAMA_MODELS_DIR` (default `~/.ollama/models`, the
folder of the Ollama desktop app), so models you already pulled are used as they are and
survive rebuilds. To get a model you don't have yet:

```bash
docker compose exec ollama ollama pull qwen3.5:4b
docker compose exec ollama ollama list
```

Without an NVIDIA GPU the model runs on the CPU (as the desktop app does on such machines).
The first request after a start loads the model into memory, which takes about a minute;
`OLLAMA_KEEP_ALIVE` (default 30 minutes) keeps it loaded. Give Docker Desktop at least
6 GB of memory for a 4B model. Check the connection with `GET /api/ai/status`.

## Installing as an app

The production build contains a web manifest and a service worker (Workbox via
vite-plugin-pwa). Browsers allow installation on `localhost` or HTTPS. For other devices on
your network you would need HTTPS (for example a reverse proxy with a certificate); this
project intentionally binds to localhost only.
