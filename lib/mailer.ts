
/**
 * Cyber Shipyard - Secure Email Verification
 *
 * Server-side Gmail SMTP delivery.
 * Never expose Gmail credentials to client components.
 */

import nodemailer from "nodemailer";

const GMAIL_SENDER = "shipyard.secure.login@gmail.com";

// Verify Gmail SMTP configuration
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

// Send a secure six-digit verification email
export async function sendOtpEmail(
  to: string,
  code: string
): Promise<void> {

  if (!gmailConfigured()) {
    throw new Error("Gmail SMTP is not configured");
  }

  // Validate the verification code and recipient
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

  // Configure Gmail SMTP
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

  // Wait for Gmail to accept the email before returning
  const result = await transport.sendMail({

    from: `"Cyber Shipyard | Secure Access" <${sender}>`,

    to,

    subject: "Cyber Shipyard | Sign-in Verification Code",

    // Plain-text fallback
    text: `Hello,

We received a request to sign in to your Cyber Shipyard account.

YOUR VERIFICATION CODE

${code}

Enter this code on the Cyber Shipyard login page to securely complete your sign-in.

This verification code expires in 10 minutes.

SECURITY NOTICE

If you did not request this verification code, you can safely ignore this email.

Never share your verification code with anyone.

Cyber Shipyard
Secure Access Portal

This is an automated security notification.
Please do not reply to this email.`,

    // Modern HTML email template
    html: `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>Cyber Shipyard Verification</title>
</head>

<body style="
  margin:0;
  padding:0;
  background-color:#f1f3f6;
  font-family:Arial,Helvetica,sans-serif;
">

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    style="background-color:#f1f3f6;"
  >
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email Container -->
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          style="
            max-width:520px;
            background-color:#ffffff;
            border-radius:12px;
            overflow:hidden;
            border:1px solid #e5e7eb;
          "
        >

          <!-- Header -->
          <tr>
            <td style="
              background-color:#111827;
              padding:32px 36px;
            ">

              <div style="
                font-size:21px;
                font-weight:800;
                color:#ffffff;
                letter-spacing:1px;
              ">
                <span style="color:#f97316;">
                  &#9670;
                </span>
                CYBER SHIPYARD
              </div>

              <div style="
                font-size:11px;
                color:#94a3b8;
                margin-top:9px;
                letter-spacing:2px;
                font-weight:600;
              ">
                SECURE ACCESS PORTAL
              </div>

            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:36px;">

              <h1 style="
                font-size:25px;
                color:#111827;
                margin:0 0 24px;
                font-weight:700;
                line-height:1.3;
              ">
                Verify your sign-in
              </h1>

              <p style="
                font-size:15px;
                color:#475569;
                line-height:1.7;
                margin:0 0 16px;
              ">
                Hello,
              </p>

              <p style="
                font-size:15px;
                color:#475569;
                line-height:1.7;
                margin:0 0 28px;
              ">
                We received a request to sign in to your
                Cyber Shipyard account. Use the verification
                code below to securely complete your sign-in.
              </p>

              <!-- OTP Code Box -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                style="
                  background-color:#fff7ed;
                  border:1px solid #fed7aa;
                  border-radius:10px;
                "
              >
                <tr>
                  <td
                    align="center"
                    style="padding:30px 12px;"
                  >

                    <div style="
                      font-size:11px;
                      color:#9a3412;
                      font-weight:700;
                      letter-spacing:2px;
                    ">
                      YOUR VERIFICATION CODE
                    </div>

                    <div style="
                      font-size:38px;
                      font-weight:800;
                      color:#111827;
                      letter-spacing:6px;
                      margin:18px 0;
                      font-family:monospace;
                      line-height:1.2;
                    ">
                      ${code}
                    </div>

                    <div style="
                      font-size:13px;
                      color:#9a3412;
                      font-weight:600;
                    ">
                      Valid for 10 minutes
                    </div>

                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <p style="
                font-size:14px;
                color:#475569;
                line-height:1.7;
                margin:26px 0 0;
              ">
                Return to the Cyber Shipyard login page
                and enter this code to verify your identity.
              </p>

              <!-- Security Notice -->
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                style="margin-top:28px;"
              >
                <tr>
                  <td style="
                    border-left:3px solid #f97316;
                    background-color:#f8fafc;
                    padding:16px;
                  ">

                    <div style="
                      color:#334155;
                      font-size:12px;
                      font-weight:700;
                      margin-bottom:7px;
                    ">
                      SECURITY NOTICE
                    </div>

                    <div style="
                      color:#64748b;
                      font-size:12px;
                      line-height:1.7;
                    ">
                      If you did not initiate this sign-in
                      request, you can safely ignore this
                      email. Never share your verification
                      code with anyone.
                    </div>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              border-top:1px solid #e5e7eb;
              padding:24px 36px;
              background-color:#fafafa;
            ">

              <div style="
                font-size:12px;
                color:#475569;
                font-weight:700;
                margin-bottom:10px;
              ">
                Cyber Shipyard
              </div>

              <div style="
                font-size:11px;
                color:#64748b;
                line-height:1.7;
              ">
                This is an automated security notification
                from Cyber Shipyard.
                Please do not reply to this email.
              </div>

              <div style="
                font-size:11px;
                color:#94a3b8;
                margin-top:16px;
              ">
                Cyber Shipyard | Secure Access
              </div>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `,
  });

  // Confirm Gmail accepted the intended recipient
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
