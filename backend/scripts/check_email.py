"""Check that verification emails can be sent.

Usage:
  python scripts/check_email.py               # show which provider is configured
  python scripts/check_email.py you@example.com   # also send a test email there
"""
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from email_otp import EmailDeliveryError, dev_mode, email_provider, send_test_email  # noqa: E402


async def main() -> int:
    provider = email_provider()
    print(f"Email provider: {provider or 'NONE'}{'  (EMAIL_OTP_DEV_MODE is on: codes are returned in API responses)' if dev_mode() else ''}")
    if not provider:
        print("Configure either RESEND_API_KEY + RESEND_FROM_EMAIL, or SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD in backend/.env")
        return 1
    if len(sys.argv) < 2:
        print("Pass an email address to send a test message.")
        return 0
    try:
        await send_test_email(sys.argv[1])
    except EmailDeliveryError as exc:
        print(f"FAILED: {exc}")
        return 1
    print(f"Test email sent to {sys.argv[1]} via {provider}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
