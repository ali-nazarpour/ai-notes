#!/bin/sh
# Apply pending migrations (a no-op when the database is current), then start the API.
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
