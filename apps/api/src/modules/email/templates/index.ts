import { EmailType, EmailTemplate } from "../email.types";
import { verificationTemplate } from "./verification.template";
import { passwordResetTemplate } from "./password-reset.template";
import { welcomeTemplate } from "./welcome.template";
import { securityAlertTemplate } from "./security-alert.template";
import { announcementTemplate } from "./announcement.template";
import { simpleNotificationTemplate } from "./simple-notification.template";

export const templates: Record<EmailType, EmailTemplate<any>> = {
  [EmailType.EMAIL_VERIFICATION]: verificationTemplate,
  [EmailType.LOGIN_OTP]: verificationTemplate,
  [EmailType.PASSWORD_RESET]: passwordResetTemplate,
  [EmailType.PASSWORD_CHANGED]: simpleNotificationTemplate,
  [EmailType.WELCOME]: welcomeTemplate,
  [EmailType.SECURITY_ALERT]: securityAlertTemplate,
  [EmailType.ACCOUNT_LOCKED]: simpleNotificationTemplate,
  [EmailType.GENERAL_ANNOUNCEMENT]: announcementTemplate,
};
