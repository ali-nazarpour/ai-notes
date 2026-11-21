"""workspaces, sharing, admin + email, documentation, blog, projects, revisions

- users: is_admin, is_active, email_notifications (the oldest account becomes admin)
- workspaces / workspace_members / workspace_invites / shares
- every user gets a personal workspace; their existing categories, notes, tasks, chats
  and boards are moved into it (workspace_id is filled in, nothing else changes)
- categories: names are unique per workspace instead of per user
- notes: settings, deleted_at (trash), updated_by
- app_settings, email_log, password_resets
- doc_spaces / doc_pages, blog_posts, projects, revisions

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
CONTENT_TABLES = ("categories", "notes", "tasks", "chat_conversations", "boards")


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _text(name: str, length: int) -> sa.Column:
    return sa.Column(name, sa.String(length=length), nullable=False, server_default="")


def _flag(name: str, default: bool) -> sa.Column:
    return sa.Column(
        name, sa.Boolean(), nullable=False, server_default=sa.true() if default else sa.false()
    )


def _ws_fk() -> sa.Column:
    return sa.Column(
        "workspace_id",
        sa.Integer(),
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )


def _author() -> sa.Column:
    return sa.Column(
        "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


def _category() -> sa.Column:
    return sa.Column(
        "category_id",
        sa.Integer(),
        sa.ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )


def upgrade() -> None:
    op.add_column("users", _flag("is_admin", False))
    op.add_column("users", _flag("is_active", True))
    op.add_column("users", _flag("email_notifications", True))
    op.execute("UPDATE users SET is_admin = true WHERE id = (SELECT min(id) FROM users)")

    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(60), nullable=False),
        _text("icon", 16),
        _text("description", 300),
        sa.Column("accent_color", sa.String(20), nullable=True),
        sa.Column("theme", sa.String(10), nullable=True),
        sa.Column("cover", sa.String(300), nullable=True),
        sa.Column("settings", JSON_TYPE, nullable=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("slug", name="uq_workspaces_slug"),
    )
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(10), nullable=False),
        _timestamp("created_at"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_user"),
    )
    op.create_table(
        "workspace_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        sa.Column("email", sa.String(254), nullable=False, index=True),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column(
            "invited_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _timestamp("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_workspace_invites_token"),
    )
    op.create_table(
        "shares",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column(
            "shared_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        _timestamp("created_at"),
        sa.UniqueConstraint("kind", "item_id", "user_id", name="uq_shares_item_user"),
    )

    # A personal workspace per existing user, owned by them.
    op.execute(
        """
        INSERT INTO workspaces (name, slug, icon, owner_id, settings)
        SELECT CASE WHEN language = 'fa' THEN 'فضای شخصی' ELSE 'Personal' END,
               'personal-' || id, '', id, NULL
        FROM users
        """
    )
    op.execute(
        """
        INSERT INTO workspace_members (workspace_id, user_id, role)
        SELECT id, owner_id, 'owner' FROM workspaces
        """
    )

    for table in CONTENT_TABLES:
        op.add_column(table, sa.Column("workspace_id", sa.Integer(), nullable=True))
        op.execute(
            f"""
            UPDATE {table} SET workspace_id =
                (SELECT w.id FROM workspaces w WHERE w.owner_id = {table}.user_id)
            WHERE user_id IS NOT NULL
            """
        )
        if table != "notes":  # legacy notes without an owner may remain
            op.alter_column(table, "workspace_id", nullable=False)
        op.create_foreign_key(
            f"fk_{table}_workspace_id_workspaces",
            table,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_workspace_id", table, ["workspace_id"])

    op.drop_constraint("uq_categories_user_name", "categories", type_="unique")
    op.create_unique_constraint(
        "uq_categories_workspace_name", "categories", ["workspace_id", "name"]
    )

    op.add_column("notes", sa.Column("settings", JSON_TYPE, nullable=True))
    op.add_column("notes", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notes", sa.Column("updated_by", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notes_updated_by_users", "notes", "users", ["updated_by"], ["id"], ondelete="SET NULL"
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("value", JSON_TYPE, nullable=True),
        _timestamp("updated_at"),
    )
    op.create_table(
        "email_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("to_email", sa.String(254), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        _timestamp("created_at"),
    )
    op.create_index("ix_email_log_created_at", "email_log", ["created_at"])
    op.create_table(
        "password_resets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _timestamp("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_password_resets_token"),
    )

    op.create_table(
        "doc_spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _author(),
        sa.Column("title", sa.String(120), nullable=False),
        _text("description", 500),
        _text("icon", 16),
        sa.Column("color", sa.String(20), nullable=False, server_default="blue"),
        sa.Column("cover", sa.String(300), nullable=True),
        _category(),
        sa.Column("tags", JSON_TYPE, nullable=True),
        _text("version", 30),
        _flag("starred", False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "doc_pages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "space_id",
            sa.Integer(),
            sa.ForeignKey("doc_spaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("doc_pages.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        _text("title", 200),
        _text("icon", 16),
        sa.Column("body", JSON_TYPE, nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _author(),
        _text("title", 200),
        sa.Column("slug", sa.String(120), nullable=False),
        _text("excerpt", 500),
        sa.Column("body", JSON_TYPE, nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover", sa.String(300), nullable=True),
        sa.Column("tags", JSON_TYPE, nullable=True),
        _category(),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        _text("seo_title", 120),
        _text("seo_description", 300),
        _flag("featured", False),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("workspace_id", "slug", name="uq_blog_posts_slug"),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        _ws_fk(),
        _author(),
        sa.Column("name", sa.String(120), nullable=False),
        _text("summary", 300),
        sa.Column("description", JSON_TYPE, nullable=True),
        sa.Column("description_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(12), nullable=False, server_default="planning"),
        sa.Column("priority", sa.String(8), nullable=False, server_default="medium"),
        sa.Column("kind", sa.String(16), nullable=False, server_default="general"),
        sa.Column("color", sa.String(20), nullable=False, server_default="indigo"),
        _text("icon", 16),
        sa.Column("cover", sa.String(300), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("budget", sa.Numeric(16, 2), nullable=True),
        sa.Column("currency", sa.String(8), nullable=False, server_default="USD"),
        _text("client", 120),
        _category(),
        sa.Column("tags", JSON_TYPE, nullable=True),
        sa.Column(
            "board_id", sa.Integer(), sa.ForeignKey("boards.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "doc_space_id",
            sa.Integer(),
            sa.ForeignKey("doc_spaces.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *(
            sa.Column(name, JSON_TYPE, nullable=True)
            for name in (
                "members",
                "milestones",
                "expenses",
                "repositories",
                "links",
                "files",
                "notes",
            )
        ),
        _flag("starred", False),
        _flag("archived", False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_table(
        "revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False, index=True),
        _text("title", 200),
        sa.Column("body", JSON_TYPE, nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        _author(),
        _timestamp("created_at"),
    )


def downgrade() -> None:
    for table in ("revisions", "projects", "blog_posts", "doc_pages", "doc_spaces"):
        op.drop_table(table)
    for table in ("password_resets", "email_log", "app_settings"):
        op.drop_table(table)
    op.drop_constraint("fk_notes_updated_by_users", "notes", type_="foreignkey")
    for column in ("updated_by", "deleted_at", "settings"):
        op.drop_column("notes", column)
    op.drop_constraint("uq_categories_workspace_name", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_user_name", "categories", ["user_id", "name"])
    for table in CONTENT_TABLES:
        op.drop_index(f"ix_{table}_workspace_id", table_name=table)
        op.drop_constraint(f"fk_{table}_workspace_id_workspaces", table, type_="foreignkey")
        op.drop_column(table, "workspace_id")
    for table in ("shares", "workspace_invites", "workspace_members", "workspaces"):
        op.drop_table(table)
    for column in ("email_notifications", "is_active", "is_admin"):
        op.drop_column("users", column)
