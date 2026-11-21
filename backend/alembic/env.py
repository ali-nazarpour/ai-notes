"""
The Alembic run environment.

What is a migration?
    The structure of the database (tables and columns) changes during the life of a
    project. We write every change in a "migration" file (the versions folder). Alembic
    records in a table called alembic_version which version the database is on, and the
    command `alembic upgrade head` runs only the migrations that have not run yet, in order.
    This way the database structure is "versioned" like code and can be rebuilt on any machine.

This file runs every time an alembic command runs, and it does two things:
    1. It gets the database address from the app settings (DATABASE_URL).
    2. It tells Alembic about the models' metadata, so that
       `alembic revision --autogenerate` can detect the difference between models and database.
"""

from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app import models  # noqa: F401  (this import registers every table in Base.metadata)
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    # NullPool: a short-lived script does not need a connection pool.
    engine = create_engine(get_settings().database_url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        # Each migration runs inside a transaction: if an error happens halfway,
        # everything is undone.
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
