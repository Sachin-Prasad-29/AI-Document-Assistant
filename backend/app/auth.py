"""
Supabase JWT authentication for the AI Document Assistant backend.

Supabase issues JWTs signed with an RS256 or ES256 key; we validate them
against the JWKS endpoint that Supabase exposes on every project.

Usage
-----
Any route that needs an authenticated user:

    @router.get("/me")
    def me(user: dict = Depends(get_current_user)):
        return user

Admin-only route:

    @router.delete("/{id}")
    def delete(id: str, user: dict = Depends(require_role("admin"))):
        ...

The resolved ``user`` dict contains:
    {
        "id":    "<supabase-uuid>",
        "email": "user@example.com",
        "role":  "admin" | "user"   (from app_metadata.role, default "user")
    }
"""

import logging

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JWKS client – cached at module level, refreshes automatically on key
# rotation (PyJWKClient handles the cache internally).
# ---------------------------------------------------------------------------
_ISSUER = f"{settings.supabase_url}/auth/v1"
_jwks_client = PyJWKClient(f"{_ISSUER}/.well-known/jwks.json")

bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Core dependency
# ---------------------------------------------------------------------------
def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    """Validate the Bearer JWT and return the caller's identity."""
    token = creds.credentials
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=_ISSUER,
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Rejected expired JWT")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = {
        "id": payload["sub"],
        "email": payload.get("email"),
        # Supabase stores custom roles under app_metadata.role
        "role": payload.get("app_metadata", {}).get("role", "user"),
    }
    logger.debug("Authenticated user id=%s role=%s", user["id"], user["role"])
    return user


# ---------------------------------------------------------------------------
# Role-based guard
# ---------------------------------------------------------------------------
def require_role(*allowed_roles: str):
    """
    Return a FastAPI dependency that passes only when the caller's role is
    in *allowed_roles*.

    Example::

        @router.delete("/{id}")
        def delete(id: str, user: dict = Depends(require_role("admin"))):
            ...
    """

    def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            logger.warning(
                "Forbidden: user id=%s role=%s tried to access admin endpoint",
                user["id"],
                user["role"],
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _checker
