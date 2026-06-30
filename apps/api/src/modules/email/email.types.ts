export enum EmailType {
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
  LOGIN_OTP = "LOGIN_OTP",
  PASSWORD_RESET = "PASSWORD_RESET",
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  WELCOME = "WELCOME",
  SECURITY_ALERT = "SECURITY_ALERT",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  GENERAL_ANNOUNCEMENT = "GENERAL_ANNOUNCEMENT",
}

export enum EmailPriority {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  NORMAL = "NORMAL",
  BULK = "BULK",
}

export type EmailPriorityType = EmailPriority;
export type EmailStatusType = "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "EXPIRED" | "DLQ";

export const EMAIL_PRIORITY_MAP: Record<EmailType, EmailPriority> = {
  [EmailType.EMAIL_VERIFICATION]: EmailPriority.CRITICAL,
  [EmailType.LOGIN_OTP]: EmailPriority.CRITICAL,
  [EmailType.PASSWORD_RESET]: EmailPriority.CRITICAL,
  [EmailType.PASSWORD_CHANGED]: EmailPriority.HIGH,
  [EmailType.SECURITY_ALERT]: EmailPriority.HIGH,
  [EmailType.ACCOUNT_LOCKED]: EmailPriority.HIGH,
  [EmailType.WELCOME]: EmailPriority.NORMAL,
  [EmailType.GENERAL_ANNOUNCEMENT]: EmailPriority.BULK,
};

export interface EmailTemplate<T> {
  subject: string;
  renderHtml(payload: T): string;
  renderText(payload: T): string;
  validatePayload(payload: any): T;
}

export interface EmailJobRecord {
  id: string;
  recipient: string;
  emailType: EmailType;
  priority: EmailPriority;
  payload: any;
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "EXPIRED";
  provider: string;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: Date;
  failedReason: string | null;
  queuedAt: Date;
  processingStartedAt: Date | null;
  sentAt: Date | null;
}
