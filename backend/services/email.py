"""
Email notification services
"""
import resend
from core.config import RESEND_API_KEY, SENDER_EMAIL, logger


async def send_email(to_email: str, subject: str, html_content: str):
    """Send email using Resend"""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return None
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        response = resend.Emails.send(params)
        logger.info(f"Email sent to {to_email}: {subject}")
        return response
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return None


def get_email_template(template_type: str, data: dict) -> tuple:
    """Get email subject and HTML content for different notification types"""
    
    if template_type == "new_registration":
        subject = f"🎉 New User Registration: {data.get('name', 'Unknown')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New User Registration</h2>
            <p>A new photographer has registered on the platform:</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Business:</strong> {data.get('business_name', 'Not provided')}</p>
                <p><strong>Registered:</strong> {data.get('created_at', 'N/A')}</p>
            </div>
            <p>Log in to the admin panel to view and manage this user.</p>
        </div>
        """
        return subject, html
    
    elif template_type == "payment_submitted":
        subject = f"💳 Payment Proof Submitted: {data.get('user_name', 'Unknown')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Payment Proof Submitted</h2>
            <p>A user has submitted payment proof and is waiting for approval:</p>
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>User:</strong> {data.get('user_name', 'N/A')}</p>
                <p><strong>Email:</strong> {data.get('user_email', 'N/A')}</p>
                <p><strong>Type:</strong> {data.get('payment_type', 'N/A')}</p>
                <p><strong>Amount:</strong> ₱{data.get('amount', 0):,}</p>
                <p><strong>Submitted:</strong> {data.get('submitted_at', 'N/A')}</p>
            </div>
            <p>Please review and approve/reject this payment in the admin panel.</p>
        </div>
        """
        return subject, html
    
    elif template_type == "payment_pending":
        subject = "⏳ Payment Received - Awaiting Verification"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Payment Under Review</h2>
            <p>Hi {data.get('user_name', 'there')},</p>
            <p>We've received your payment proof and it's currently being reviewed by our team.</p>
            <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Type:</strong> {data.get('payment_type', 'N/A')}</p>
                <p><strong>Amount:</strong> ₱{data.get('amount', 0):,}</p>
                <p><strong>Status:</strong> Pending Review</p>
            </div>
            <p>You'll receive an email notification once your payment has been verified. This usually takes less than 24 hours.</p>
            <p>Thank you for your patience!</p>
        </div>
        """
        return subject, html
    
    elif template_type == "payment_approved":
        subject = "✅ Payment Approved!"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Payment Approved!</h2>
            <p>Hi {data.get('user_name', 'there')},</p>
            <p>Great news! Your payment has been verified and approved.</p>
            <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Type:</strong> {data.get('payment_type', 'N/A')}</p>
                <p><strong>Amount:</strong> ₱{data.get('amount', 0):,}</p>
                {"<p><strong>New Plan:</strong> " + data.get('new_plan', '').title() + "</p>" if data.get('new_plan') else ""}
                {"<p><strong>Credits Added:</strong> " + str(data.get('credits_added', 0)) + "</p>" if data.get('credits_added') else ""}
            </div>
            <p>Your account has been updated. Enjoy your new features!</p>
        </div>
        """
        return subject, html
    
    elif template_type == "payment_rejected":
        subject = "❌ Payment Could Not Be Verified"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Payment Not Approved</h2>
            <p>Hi {data.get('user_name', 'there')},</p>
            <p>Unfortunately, we were unable to verify your payment.</p>
            <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Reason:</strong> {data.get('reason', 'No reason provided')}</p>
            </div>
            <p>If you believe this is an error, you can dispute this decision once by logging into your account and clicking "Dispute & Resubmit" in your dashboard.</p>
            <p>If you have any questions, please contact our support team.</p>
        </div>
        """
        return subject, html
    
    return "Notification", "<p>You have a new notification.</p>"
