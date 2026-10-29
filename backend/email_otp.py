"""Email one-time codes for customer and pharmacist email verification."""
import asyncio
import hashlib
import hmac
import logging
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 45
MAX_ATTEMPTS = 5


def _flag(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


def dev_mode() -> bool:
    """Returns codes in API responses. Only for isolated local testing."""
    return _flag("EMAIL_OTP_DEV_MODE")


def smtp_configured() -> bool:
    return all(os.environ.get(key) for key in ("SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD"))


def resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("RESEND_FROM_EMAIL"))


def email_provider() -> Optional[str]:
    """EMAIL_PROVIDER=resend|smtp picks one explicitly; otherwise Resend if configured, then SMTP."""
    chosen = os.environ.get("EMAIL_PROVIDER", "").strip().lower()
    if chosen == "resend":
        return "resend" if resend_configured() else None
    if chosen == "smtp":
        return "smtp" if smtp_configured() else None
    if resend_configured():
        return "resend"
    return "smtp" if smtp_configured() else None


class EmailDeliveryError(Exception):
    """Raised with a message that is safe to log (never contains credentials)."""


def _code_email(code: str, audience: str) -> tuple[str, str, str]:
    subject = f"Your Justlocal code: {code}"
    text = (
        f"Your Justlocal {audience} verification code is {code}.\n\n"
        f"It expires in {CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email."
    )
    html = (
        "<div style=\"font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0b2545\">"
        "<h2 style=\"margin:0 0 12px;color:#0d9488\">Justlocal</h2>"
        f"<p>Your {audience} verification code is:</p>"
        f"<p style=\"font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0\">{code}</p>"
        f"<p style=\"color:#5b6b7f\">It expires in {CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>"
        "</div>"
    )
    return subject, text, html


def _hash(purpose: str, email: str, code: str) -> str:
    pepper = os.environ.get("EMAIL_OTP_PEPPER") or os.environ.get("JWT_SECRET", "justlocal-development-secret")
    return hmac.new(pepper.encode(), f"{purpose}:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _send_smtp(to_email: str, subject: str, text: str, html: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ["SMTP_USERNAME"]
    password = os.environ["SMTP_PASSWORD"]
    if "gmail" in host.lower():
        password = password.replace(" ", "")  # Google shows App Passwords with spaces
    sender = os.environ.get("SMTP_FROM_EMAIL") or username
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"Justlocal <{sender}>"
    message["To"] = to_email
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    try:
        if _flag("SMTP_USE_SSL"):
            server = smtplib.SMTP_SSL(host, port, context=context, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            if _flag("SMTP_STARTTLS", "true"):
                server.starttls(context=context)
        with server:
            try:
                server.login(username, password)
            except smtplib.SMTPServerDisconnected as exc:
                # Gmail closes the connection after a rejected login instead of letting smtplib retry.
                raise smtplib.SMTPAuthenticationError(535, b"Login rejected and connection closed") from exc
            server.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        hint = " For Gmail, SMTP_PASSWORD must be a 16-letter App Password, not your normal password." if "gmail" in host.lower() else ""
        raise EmailDeliveryError(f"SMTP login rejected ({exc.smtp_code}).{hint}") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailDeliveryError(f"SMTP error: {type(exc).__name__}: {exc}") from exc


async def _send_resend(to_email: str, subject: str, text: str, html: str) -> None:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=20) as http:
            response = await http.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                json={"from": os.environ["RESEND_FROM_EMAIL"], "to": [to_email], "subject": subject, "text": text, "html": html},
            )
    except httpx.HTTPError as exc:
        raise EmailDeliveryError(f"Resend request failed: {type(exc).__name__}") from exc
    if response.status_code >= 300:
        try:
            message = response.json().get("message", "")
        except ValueError:
            message = ""
        raise EmailDeliveryError(f"Resend rejected the email (HTTP {response.status_code}): {message[:200]}")


async def deliver_email(to_email: str, subject: str, text: str, html: str) -> str:
    provider = email_provider()
    if provider == "resend":
        await _send_resend(to_email, subject, text, html)
    elif provider == "smtp":
        await asyncio.to_thread(_send_smtp, to_email, subject, text, html)
    else:
        raise EmailDeliveryError("No email provider is configured")
    return provider


async def send_test_email(to_email: str) -> str:
    subject, text, html = _code_email("123456", "test")
    return await deliver_email(to_email, "Justlocal email test", "This is a test email from your Justlocal server.\n\n" + text, html)


async def send_code(db, email: str, purpose: str, audience: str) -> dict:
    """Create and email a new code. Returns extra response fields (dev code only in dev mode)."""
    now = datetime.now(timezone.utc)
    existing = await db.email_otps.find_one({"email": email, "purpose": purpose})
    if existing and existing.get("last_sent_at"):
        last_sent = existing["last_sent_at"]
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        wait = RESEND_COOLDOWN_SECONDS - (now - last_sent).total_seconds()
        if wait > 0:
            raise HTTPException(status_code=429, detail=f"Please wait {int(wait) + 1} seconds before requesting another code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    if not email_provider() and not dev_mode():
        raise HTTPException(status_code=503, detail="Email delivery is not configured on the server")

    if email_provider():
        subject, text, html = _code_email(code, audience)
        try:
            await deliver_email(email, subject, text, html)
        except EmailDeliveryError as exc:
            logger.error("Verification email to %s failed: %s", email, exc)
            if not dev_mode():
                raise HTTPException(status_code=502, detail="We couldn't send the verification email. Please try again shortly.") from exc

    await db.email_otps.update_one(
        {"email": email, "purpose": purpose},
        {"$set": {
            "code_hash": _hash(purpose, email, code),
            "attempts": 0,
            "last_sent_at": now,
            "expires_at": now + timedelta(minutes=CODE_TTL_MINUTES),
        }},
        upsert=True,
    )
    extra: dict = {"code_expires_in_minutes": CODE_TTL_MINUTES}
    if dev_mode():
        extra["dev_code"] = code
    return extra


async def check_code(db, email: str, purpose: str, code: str) -> None:
    """Raise HTTPException unless the code is valid. Consumes the code on success."""
    record = await db.email_otps.find_one({"email": email, "purpose": purpose})
    if not record:
        raise HTTPException(status_code=400, detail="No active code. Request a new one.")
    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This code has expired. Request a new one.")
    if record.get("attempts", 0) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new code.")
    if not hmac.compare_digest(record["code_hash"], _hash(purpose, email, code.strip())):
        await db.email_otps.update_one({"_id": record["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="That code is incorrect")
    await db.email_otps.delete_one({"_id": record["_id"]})
