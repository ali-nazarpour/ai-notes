"""
Alarms: personal reminders (not tied to a workspace).

The server stores the alarms; the browser decides when one rings, because only it knows
the user's clock and time zone, and reports the ring with ``/fired`` so the alarm rings
once even with several tabs or devices open. A one-time alarm turns itself off after
ringing. Snoozing sets ``snoozed_until``.
"""

from datetime import UTC, datetime, timedelta
from datetime import date as day_type
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ConflictError, NotFoundError
from app.core.palette import ColorName
from app.models import Alarm, User

router = APIRouter(prefix="/api/alarms", tags=["alarms"])

Repeat = Literal["once", "daily", "weekdays", "weekly", "monthly"]
Sound = Literal["chime", "bell", "beep", "digital", "soft"]


def _check_time(value: str) -> str:
    parts = value.split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError("Use HH:MM.")
    hours, minutes = int(parts[0]), int(parts[1])
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError("Use HH:MM.")
    return f"{hours:02d}:{minutes:02d}"


def _check_days(value: list[int] | None) -> list[int] | None:
    if value is None:
        return None
    return sorted({d for d in value if 0 <= d <= 6})


class AlarmFields(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=1000)
    time: str = Field(max_length=5, examples=["07:30"])
    date: day_type | None = None
    repeat: Repeat = "once"
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    enabled: bool = True
    sound: Sound = "chime"
    color: ColorName = "amber"
    link: str | None = Field(default=None, max_length=300, pattern=r"^/[^\s]*$")

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        return _check_time(value)

    @field_validator("weekdays")
    @classmethod
    def valid_days(cls, value: list[int]) -> list[int]:
        return _check_days(value) or []


class AlarmUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=1000)
    time: str | None = Field(default=None, max_length=5)
    date: day_type | None = None
    repeat: Repeat | None = None
    weekdays: list[int] | None = Field(default=None, max_length=7)
    enabled: bool | None = None
    sound: Sound | None = None
    color: ColorName | None = None
    link: str | None = Field(default=None, max_length=300, pattern=r"^/[^\s]*$")

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str | None) -> str | None:
        return _check_time(value) if value is not None else None

    @field_validator("weekdays")
    @classmethod
    def valid_days(cls, value: list[int] | None) -> list[int] | None:
        return _check_days(value)


class AlarmRead(AlarmFields):
    model_config = ConfigDict(from_attributes=True)

    id: int
    last_fired_at: datetime | None
    snoozed_until: datetime | None
    created_at: datetime
    updated_at: datetime

    @field_validator("weekdays", mode="before")
    @classmethod
    def none_days(cls, value: list[int] | None) -> list[int]:
        return value or []


class Fired(BaseModel):
    at: datetime


class Snooze(BaseModel):
    minutes: int = Field(ge=1, le=24 * 60)


def _get(db: DbSession, user: User, alarm_id: int) -> Alarm:
    alarm = db.get(Alarm, alarm_id)
    if alarm is None or alarm.user_id != user.id:
        raise NotFoundError("Alarm not found.", code="alarm_not_found")
    return alarm


def _read(alarm: Alarm) -> AlarmRead:
    return AlarmRead.model_validate(alarm)


@router.get("", response_model=list[AlarmRead], summary="Your alarms")
def list_alarms(user: CurrentUser, db: DbSession) -> list[AlarmRead]:
    rows = db.scalars(select(Alarm).where(Alarm.user_id == user.id).order_by(Alarm.time))
    return [_read(a) for a in rows]


@router.post("", response_model=AlarmRead, status_code=status.HTTP_201_CREATED)
def create_alarm(body: AlarmFields, user: CurrentUser, db: DbSession) -> AlarmRead:
    count = len(db.scalars(select(Alarm.id).where(Alarm.user_id == user.id)).all())
    if count >= 200:
        raise ConflictError("You can have up to 200 alarms.", code="too_many_alarms")
    data = body.model_dump()
    data["title"] = data["title"].strip()
    alarm = Alarm(user_id=user.id, **data)
    db.add(alarm)
    db.commit()
    db.refresh(alarm)
    return _read(alarm)


@router.patch("/{alarm_id}", response_model=AlarmRead)
def update_alarm(alarm_id: int, body: AlarmUpdate, user: CurrentUser, db: DbSession) -> AlarmRead:
    alarm = _get(db, user, alarm_id)
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key not in ("date", "link"):
            continue
        setattr(alarm, key, value)
    if {"time", "date", "repeat", "weekdays"} & changes.keys() or changes.get("enabled"):
        # A changed schedule starts fresh: no pending snooze, and it may ring again today.
        alarm.snoozed_until = None
        alarm.last_fired_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    db.refresh(alarm)
    return _read(alarm)


@router.delete("/{alarm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alarm(alarm_id: int, user: CurrentUser, db: DbSession) -> None:
    db.delete(_get(db, user, alarm_id))
    db.commit()


@router.post("/{alarm_id}/fired", response_model=AlarmRead, summary="Record that it rang")
def fired(alarm_id: int, body: Fired, user: CurrentUser, db: DbSession) -> AlarmRead:
    alarm = _get(db, user, alarm_id)
    at = body.at if body.at.tzinfo else body.at.replace(tzinfo=UTC)
    last = alarm.last_fired_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    if last is not None and last >= at:
        raise ConflictError("This alarm already rang.", code="alarm_already_fired")
    alarm.last_fired_at = at
    alarm.snoozed_until = None
    if alarm.repeat == "once":
        alarm.enabled = False
    db.commit()
    db.refresh(alarm)
    return _read(alarm)


@router.post("/{alarm_id}/snooze", response_model=AlarmRead, summary="Ring again later")
def snooze(alarm_id: int, body: Snooze, user: CurrentUser, db: DbSession) -> AlarmRead:
    alarm = _get(db, user, alarm_id)
    alarm.snoozed_until = datetime.now(UTC) + timedelta(minutes=body.minutes)
    alarm.enabled = True
    db.commit()
    db.refresh(alarm)
    return _read(alarm)
