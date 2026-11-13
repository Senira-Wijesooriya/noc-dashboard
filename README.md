# MITESP Check Point Shipyard — Security Upgrade

A client asset and Check Point Jumbo Hotfix monitoring dashboard built with **Next.js 16**, **Vercel**, and the **existing Vercel KV / Upstash Redis** database. It has:

- Passwordless, six-digit corporate email code sign-in (`@mitesp.com` only). Uses a Resend-approved sending domain, hashed expiring OTPs, rate limits, server-side sessions and httpOnly cookies.
- Server-side access checks on dashboard, edit, log, backup, sync and restore APIs.
- Four Check Point versions (R81.20, R82, R82.10, R82.20) with latest *published* JHF Takes from the official per-version Downloads page, source error indicators and hourly refresh.
- Client/asset edits, immutable audit entries, a 200-entry recycle history, optimistic concurrency protection and conflict-checked undo.
- Per-client/all-clients print-to-PDF and CSV reports, plus an authenticated full data JSON backup.

**Read [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) before replacing the live deployment.** The guide covers backing up Redis data, setting email sender credentials, updating the existing GitHub repository and verifying Vercel.

## Local setup

1. Install Node.js 22 and clone the existing project.
2. Copy `.env.example` to `.env.local` and enter your **existing** KV values and newly provisioned email-sender credentials.
3. Run `npm ci`, then `npm test`, `npm run build`, `npm run dev`.
4. Open `http://localhost:3000` and request an OTP for a permitted work email.

No real secrets, client records or demo accounts are included in this ZIP. Do not store secrets in Git, browser-side code or screenshots.

> **Important:** A *latest published* Jumbo Hotfix Take is not automatically a vendor-recommended or safe production upgrade for a particular gateway. Check the vendor's Critical Information, support requirements, special hotfixes and customer change approvals.

> **Status:** Source-level checks and 10 unit/integration tests were performed during preparation. The Next.js production build and end-to-end verification email delivery must be executed in an environment with npm access, the project Redis credentials and an authorized email provider.
