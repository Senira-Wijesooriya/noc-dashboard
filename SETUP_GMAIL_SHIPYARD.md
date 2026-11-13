# Check Point Shipyard — Gmail OTP update

This patch replaces only the OTP email delivery service. Your Check Point hotfix versions, dashboard data, client assets, audit logs, reports, and recycle bin remain unchanged.

## 1. Secure the dedicated sender account

Use: **shipyard.secure.login@gmail.com**.

1. Visit https://myaccount.google.com/security while signed in to this Gmail account.
2. Turn on **2-Step Verification**.
3. Visit https://myaccount.google.com/apppasswords and, if available, create an App Password named `Check Point Shipyard Vercel`.
4. Copy the **16-character App Password**. This is **not** your normal Gmail password. Never paste either password into ChatGPT or GitHub.

If the App Password option is unavailable, the account may not be eligible. Do not disable 2-Step Verification or use the normal Gmail password as a workaround.

## 2. Apply this patch to your existing GitHub clone

Your working folder:

`C:\Users\Senira Wijesooriya\Downloads\noc-dashboard-live`

Extract `shipyard-gmail-otp-patch.zip`. Copy the following files into the corresponding paths in `noc-dashboard-live`, allowing replacement:

- `app/api/auth/route.ts`
- `lib/mailer.ts` (new)
- `lib/security.ts`
- `tests/project.test.cjs`
- `.env.example` (documentation only; preserve `.env.local`)

Do not copy a whole new project folder inside `noc-dashboard-live`. Do not delete `.git` or overwrite `.env.local`.

**Important:** Nodemailer is a new dependency, so run **npm install**, not npm ci, when first installing the patch:

```cmd
cd /d "%USERPROFILE%\Downloads\noc-dashboard-live"
npm install nodemailer
npm install --save-dev @types/nodemailer
npm test
npm run build
```

`npm install` must update BOTH `package.json` and `package-lock.json`. If `npm run build` still reports the old `lib/firebase.ts` missing-module error, remove the unused file with `git rm lib/firebase.ts` and repeat the build. Never push until tests AND build pass.

## 3. Set Vercel production environment variables

In Vercel -> noc-dashboard -> Settings -> Environment Variables -> Production, add:

- `GMAIL_SENDER_EMAIL` = `shipyard.secure.login@gmail.com`
- `GMAIL_APP_PASSWORD` = your private 16-character Google App Password (no spaces)
- `OTP_HASH_SECRET` = a strong random 32+ character secret (keep any existing secret if already set; changing it invalidates pending codes)
- `SHIPYARD_ALLOWED_EMAILS` = comma-separated, explicitly authorized corporate mailboxes; e.g. `seniraw@mitesp.com`

The allowlist is **required**: this patch rejects ALL sign-ins if the allowlist is empty. It also only accepts the exact `@mitesp.com` domain.

**Keep your existing Redis/KV integration and environment variables unchanged.** Do not create a new empty KV database or expose access tokens.

You no longer need `RESEND_API_KEY` or `OTP_FROM_EMAIL` for this authentication method. Remove those old variables when confident the update works.

For local testing, add these variables to `.env.local` too. Never commit `.env.local` to Git.

## 4. Publish to your existing Vercel website

```cmd
cd /d "%USERPROFILE%\Downloads\noc-dashboard-live"
git status
git add .
git commit -m "Use Gmail for Shipyard email verification"
git push origin main
```

Wait until Vercel shows the latest deployment **Ready**. Then test login by entering an allowlisted `@mitesp.com` email and requesting a code. Check that email inbox and its junk/quarantine folders. Enter the six-digit code on the Shipyard site.

If email fails, open Vercel -> Deployments -> latest -> Logs. `EAUTH` may indicate an incorrect/revoked App Password; `ETIMEDOUT` may indicate Gmail or Vercel SMTP connectivity trouble. Gmail SMTP is suitable for a small authorized test environment, but isn't a reliable production transactional-email provider. For sensitive customer/NOC assets, obtain employer authorization before real use.

## 5. Security and troubleshooting

- App Passwords require Google 2-Step Verification. Google can revoke them (for example, after a Google account password change).
- Your Gmail account sends mail **to** corporate inboxes; no access to `mitesp.com` DNS or Exchange administration is required. Corporate anti-spam policies can still block or quarantine the email.
- Gmail is designed for personal correspondence; automated high-volume mail can be rate limited or blocked.
- The server generates codes, checks the employee mailbox ownership, stores only hashed OTPs with 10-minute expiry, and limits retries. Valid authentication creates an HTTP-only session cookie.
- Only approved staff addresses should be included in `SHIPYARD_ALLOWED_EMAILS`.
- This is not official MITESP identity/SSO and should not be presented as such.
- Keep secrets in Vercel; never commit them, screenshot them or share them in chat.

References:
- Google App Passwords: https://support.google.com/accounts/answer/185833
- Vercel SMTP: https://vercel.com/kb/guide/serverless-functions-and-smtp
- Nodemailer Gmail: https://nodemailer.com/guides/using-gmail
