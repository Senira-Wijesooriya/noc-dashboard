
/**
 * Cyber Shipyard - Email Verification
 * Plain-text OTP email using Gmail SMTP.
 * Server-side only.
 */

import nodemailer from "nodemailer";

const GMAIL_SENDER = "shipyard.secure.login@gmail.com";

export function gmailConfigured(): boolean {
  const sender = process.env.GMAIL_SENDER_EMAIL
    ?.trim()
    .toLowerCase();

  const appPassword = process.env.GMAIL_APP_PASSWORD
    ?.replace(/\s/g, "");

  return (
    sender === GMAIL_SENDER &&
    !!appPassword &&
    appPassword.length === 16
  );
}

export async function sendOtpEmail(
  to: string,
  code: string
): Promise<void> {
  if (!gmailConfigured()) {
    throw new Error("Gmail SMTP is not configured");
  }

  if (
    !/^[0-9]{6}$/.test(code) ||
    !/^[a-z0-9.!#$%&'*+\/?^_`{|}~-]+@mitesp\.com$/.test(to)
  ) {
    throw new Error("Invalid verification recipient or code");
  }

  const sender = process.env.GMAIL_SENDER_EMAIL!
    .trim()
    .toLowerCase();

  const appPassword = process.env.GMAIL_APP_PASSWORD!
    .replace(/\s/g, "");

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: sender,
      pass: appPassword,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  const result = await transport.sendMail({
    from: `"Cyber Shipyard" <${sender}>`,
    to,
    subject: "Cyber Shipyard - Your Verification Code",

    text: `Hello,

Your Cyber Shipyard verification code is:

${code}

Enter this code on the Cyber Shipyard login page to complete your sign-in.

This code expires in 10 minutes.

If you did not request this code, please ignore this email.

For your security, never share your verification code with anyone.

Regards,
Cyber Shipyard
Secure Access Portal

This is an automated verification email. Please do not reply.`,
  });

  const accepted = Array.isArray(result.accepted)
    ? result.accepted.some(
        (recipient: string) =>
          recipient.toLowerCase() === to.toLowerCase()
      )
    : false;

  const rejected = Array.isArray(result.rejected)
    ? result.rejected.length
    : 0;

  if (!accepted || rejected > 0) {
    throw new Error(
      "Gmail did not accept the verification recipient"
    );
  }
}
