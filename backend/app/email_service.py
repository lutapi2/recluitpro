import os
import smtplib
from email.message import EmailMessage


def send_email(recipient: str, subject: str, text_body: str, html_body: str) -> None:
    host = os.getenv("SMTP_HOST", "127.0.0.1")
    port = int(os.getenv("SMTP_PORT", "1025"))
    sender = os.getenv("MAIL_FROM", "RecruitPro <no-reply@recruitpro.local>")
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "10"))
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(host, port, timeout=timeout) as smtp:
        smtp.ehlo()
        if os.getenv("SMTP_STARTTLS", "false").lower() == "true":
            smtp.starttls()
            smtp.ehlo()
        username = os.getenv("SMTP_USERNAME")
        if username:
            smtp.login(username, os.getenv("SMTP_PASSWORD", ""))
        smtp.send_message(message)
