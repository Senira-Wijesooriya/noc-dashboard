/** Server-only Gmail SMTP delivery. Never include Gmail credentials in client components. */
import nodemailer from "nodemailer";

const GMAIL_SENDER = "shipyard.secure.login@gmail.com";

export function gmailConfigured(): boolean {
  const sender = process.env.GMAIL_SENDER_EMAIL?.trim().toLowerCase();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  return sender === GMAIL_SENDER && !!appPassword && appPassword.length === 16;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!gmailConfigured()) throw new Error("Gmail SMTP is not configured");
  if (!/^[0-9]{6}$/.test(code) || !/^[a-z0-9.!#$%&'*+\/?^_`{|}~-]+@mitesp\.com$/.test(to)) {
    throw new Error("Invalid verification recipient or code");
  }

  const sender = process.env.GMAIL_SENDER_EMAIL!.trim().toLowerCase();
  const appPassword = process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, "");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: sender, pass: appPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  // Await the SMTP transaction before responding. Background sends may be
  // suspended when a Vercel Serverless Function returns its response.
  const result = await transport.sendMail({
    from: `"Shipyard Sign-In" <${sender}>`,
    to,
    subject: "Check Point Shipyard - your verification code",
    text: `Your Check Point Shipyard verification code is ${code}.\n\nThis code expires in 10 minutes. If you did not request it, ignore this message.\n\nThis is an automated verification email.`,
  });

  if (!Array.isArray(result.accepted) || !result.accepted.some((recipient: unknown) => String(recipient).toLowerCase() === to) || (result.rejected?.length ?? 0) > 0) {
    throw new Error("Gmail did not accept the verification recipient");
  }
}
