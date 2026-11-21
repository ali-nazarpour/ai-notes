"""
Password hashing (scrypt with a per-password salt) and session tokens.

Stored password format: ``scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>``. Keeping the cost
parameters in the string allows raising them later without breaking existing hashes.
Only the SHA-256 of a session token is stored, so a leaked database cannot be used to sign in.
"""

import base64
import hashlib
import hmac
import secrets

_N, _R, _P = 2**14, 8, 1
_KEY_LENGTH = 32


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_LENGTH
    )
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = stored.split("$")
        if algorithm != "scrypt":
            return False
        expected_bytes = base64.b64decode(expected)
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected_bytes),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate, expected_bytes)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
