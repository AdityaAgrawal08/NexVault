import crypto from "crypto";

export interface EmailProvider {
  name: string;
  send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<{ messageId: string }>;
}

export class MockEmailProvider implements EmailProvider {
  public name = "MockEmailProvider";

  public async send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<{ messageId: string }> {
    const messageId = `mock-msg-${crypto.randomUUID()}`;
    
    // Log the outbound email details to the console
    console.log(`
==================================================
[EMAIL OUTBOUND]
Provider:   ${this.name}
Message ID: ${messageId}
To:         ${to}
Subject:    ${subject}
Text Body:  ${text}
==================================================
`);
    
    // Simulate slight network latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    return { messageId };
  }
}

// Stubs for production providers
export class ResendEmailProvider implements EmailProvider {
  public name = "Resend";
  public async send(to: string, subject: string, html: string, text: string) {
    console.log(`[Resend] Stub send to ${to}`);
    return { messageId: `resend-${crypto.randomUUID()}` };
  }
}

export class SendGridEmailProvider implements EmailProvider {
  public name = "SendGrid";
  public async send(to: string, subject: string, html: string, text: string) {
    console.log(`[SendGrid] Stub send to ${to}`);
    return { messageId: `sendgrid-${crypto.randomUUID()}` };
  }
}
