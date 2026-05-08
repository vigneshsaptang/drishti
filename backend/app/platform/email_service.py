"""
SMTP email service — zero external dependencies, uses stdlib smtplib only.
"""
import logging
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

from app.config import settings

logger = logging.getLogger("auracle.email")


def smtp_enabled() -> bool:
    return bool(settings.smtp_host)


class _SmtpSender:
    def __init__(self):
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.user = settings.smtp_user
        self.password = settings.smtp_password
        self.use_tls = settings.smtp_use_tls
        self.starttls = settings.smtp_starttls
        self.timeout = settings.smtp_timeout_s

    def _connect(self):
        if self.use_tls:
            conn = smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout)
        else:
            conn = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
            if self.starttls:
                conn.starttls()
        if self.user and self.password:
            conn.login(self.user, self.password)
        return conn

    def build_message(
        self,
        to: str,
        subject: str,
        html_body: str,
        reply_to: str | None = None,
        attachments: list[tuple[str, bytes, str]] | None = None,
    ) -> MIMEMultipart:
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{settings.support_email_from_name} <{settings.support_email_from}>"
        msg["To"] = to
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if attachments:
            total_size = 0
            for filename, file_bytes, content_type in attachments:
                total_size += len(file_bytes)
                if total_size > 10 * 1024 * 1024:
                    break
                subtype = content_type.split("/")[1] if "/" in content_type else "png"
                img = MIMEImage(file_bytes, _subtype=subtype)
                img.add_header("Content-Disposition", "attachment", filename=filename)
                msg.attach(img)
        return msg

    def send(self, msg: MIMEMultipart):
        conn = self._connect()
        try:
            conn.send_message(msg)
        finally:
            conn.quit()

    def send_with_retry(self, msg: MIMEMultipart, max_attempts: int = 3) -> bool:
        for attempt in range(1, max_attempts + 1):
            try:
                self.send(msg)
                return True
            except Exception as e:
                logger.warning("SMTP send attempt %d/%d failed: %s", attempt, max_attempts, e)
                if attempt < max_attempts:
                    time.sleep(2 ** attempt)
        return False


_sender = None


def _get_sender() -> _SmtpSender:
    global _sender
    if _sender is None:
        _sender = _SmtpSender()
    return _sender


def send_ticket_email(ticket: dict, attachments: list[tuple[str, bytes, str]] | None = None) -> bool:
    if not smtp_enabled():
        return False
    from app.platform.email_templates import render_new_ticket_email
    sender = _get_sender()
    subject, html = render_new_ticket_email(ticket)
    msg = sender.build_message(
        to=settings.support_email_to,
        subject=subject,
        html_body=html,
        reply_to=ticket.get("user_email"),
        attachments=attachments,
    )
    return sender.send_with_retry(msg)


def send_reply_email(ticket: dict, reply: dict) -> bool:
    if not smtp_enabled():
        return False
    user_email = ticket.get("user_email")
    if not user_email:
        return False
    from app.platform.email_templates import render_reply_email
    sender = _get_sender()
    subject, html = render_reply_email(ticket, reply)
    msg = sender.build_message(to=user_email, subject=subject, html_body=html)
    return sender.send_with_retry(msg)


def send_status_notification_email(ticket: dict, old_status: str, new_status: str) -> bool:
    if not smtp_enabled():
        return False
    user_email = ticket.get("user_email")
    if not user_email:
        return False
    from app.platform.email_templates import render_status_change_email
    sender = _get_sender()
    subject, html = render_status_change_email(ticket, old_status, new_status)
    msg = sender.build_message(to=user_email, subject=subject, html_body=html)
    return sender.send_with_retry(msg)
