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
  private apiKey: string;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  public async send(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<{ messageId: string }> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: to,
        subject: subject,
        html: html,
        text: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { id: string };
    return { messageId: data.id };
  }
}

export class SendGridEmailProvider implements EmailProvider {
  public name = "SendGrid";
  public async send(to: string, subject: string, html: string, text: string) {
    console.log(`[SendGrid] Stub send to ${to}`);
    return { messageId: `sendgrid-${crypto.randomUUID()}` };
  }
}
