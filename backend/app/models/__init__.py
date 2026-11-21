"""All ORM models. Importing this package registers every table in Base.metadata."""

from app.models.admin import AppSetting, EmailLog, PasswordReset
from app.models.board import Board, BoardCard, BoardList, CardComment
from app.models.category import Category
from app.models.chat import ChatConversation, ChatMessage
from app.models.content import BlogPost, DocPage, DocSpace, Project, Revision
from app.models.file import StoredFile
from app.models.note import Note
from app.models.task import Task
from app.models.user import AuthToken, User
from app.models.v5 import Alarm, DriveItem, LangCard, LangDeck, LangReview, LangSong, SlideDeck
from app.models.vault import Vault, VaultItem
from app.models.workspace import Share, Workspace, WorkspaceInvite, WorkspaceMember

__all__ = [
    "Alarm",
    "AppSetting",
    "AuthToken",
    "BlogPost",
    "Board",
    "BoardCard",
    "BoardList",
    "CardComment",
    "Category",
    "ChatConversation",
    "ChatMessage",
    "DocPage",
    "DocSpace",
    "DriveItem",
    "EmailLog",
    "LangCard",
    "LangDeck",
    "LangReview",
    "LangSong",
    "Note",
    "PasswordReset",
    "Project",
    "Revision",
    "Share",
    "SlideDeck",
    "StoredFile",
    "Task",
    "User",
    "Vault",
    "VaultItem",
    "Workspace",
    "WorkspaceInvite",
    "WorkspaceMember",
]
