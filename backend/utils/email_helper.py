import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import os

load_dotenv()

EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")


def send_otp_email(to_email: str, otp_code: str, username: str) -> bool:
    """Send OTP verification email"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "PINIT — Your Verification Code"
        msg["From"]    = EMAIL_USER
        msg["To"]      = to_email

        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 30px; border-radius: 12px;">
                <h2 style="color: #667eea; margin: 0 0 10px;">PINIT</h2>
                <p style="color: #ccc; font-size: 14px;">Image Verification Platform</p>
            </div>
            <div style="padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
                <h3>Hi {username},</h3>
                <p>Your verification code is:</p>
                <div style="background: #f7fafc; border: 2px solid #667eea;
                            border-radius: 8px; padding: 20px; text-align: center;
                            font-size: 36px; font-weight: bold; letter-spacing: 8px;
                            color: #667eea; margin: 20px 0;">
                    {otp_code}
                </div>
                <p style="color: #666; font-size: 13px;">
                    This code expires in <strong>10 minutes</strong>.<br>
                    If you did not request this, ignore this email.
                </p>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, to_email, msg.as_string())

        return True

    except Exception as e:
        print(f"Email send error: {e}")
        return False


def send_new_device_email(to_email: str, username: str, device_name: str) -> bool:
    """Notify user when a new device is registered"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "PINIT — New Device Registered"
        msg["From"]    = EMAIL_USER
        msg["To"]      = to_email

        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 30px; border-radius: 12px;">
                <h2 style="color: #667eea;">PINIT</h2>
            </div>
            <div style="padding: 30px; border: 1px solid #e2e8f0;">
                <h3>Hi {username},</h3>
                <p>A new device was registered to your account:</p>
                <div style="background: #f7fafc; padding: 15px; border-radius: 8px;
                            border-left: 4px solid #667eea;">
                    <strong>Device:</strong> {device_name}
                </div>
                <p style="color: #666; font-size: 13px; margin-top: 20px;">
                    If this was not you, contact support immediately.
                </p>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, to_email, msg.as_string())

        return True

    except Exception as e:
        print(f"Email send error: {e}")
        return False