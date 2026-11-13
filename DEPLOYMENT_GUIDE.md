# MITESP Shipyard — Full deployment and update guide (13 November 2026)

## A. What you currently host

Based on the uploaded project ZIPs and deployment-history PDF:
- GitHub repository: **Senira-Wijesooriya/noc-dashboard** (branch **main**).
- Hosting/build pipeline: **Vercel** automatically deploys new commits to `main`.
- Backend persistence: **Vercel KV / Upstash Redis** (`@vercel/kv` package).
- Earlier browser sign-in: Firebase / Google, then an *unverified* typed office email. This release replaces that login with server-verified email OTP; Firebase is no longer used for access.
- Live client records are in existing Redis keys, not in the source ZIP.

**This package is source code. Deploying the ZIP itself to your browser does not update the live site. Your existing Vercel deployment must use the updated repository and environment variables.**

## B. Before modifying anything (must do)

1. Confirm with your team/company that this dashboard is approved to host customer firewall asset information on Vercel and with the configured email sender.
2. In Vercel, open the existing `noc-dashboard` project. Write down which GitHub repository/branch is connected, which storage integration/Redis instance is attached, and the current production URL. **Do not detach or delete the existing Redis instance.**
3. Take a **database backup before deploy**. From Vercel Storage/Upstash console, export or copy these existing Redis keys and their values: `data:customers`, `data:logs`, `data:recycle`, `data:revision` (if present), `settings:targets`, `settings:targets_last_updated`. For `settings:targets`, copy the full Redis hash, not just a plain string. The new dashboard's Backup button is useful AFTER deployment, but it cannot protect the pre-deployment state. Restrict who can access backup files; they include client infrastructure data.
4. Create a Git rollback point in the existing repository: `git tag shipyard-before-email-otp` and (if authorized) `git push origin shipyard-before-email-otp`.
5. Verify the live dashboard is displaying expected existing clients/assets before any change.

## C. Configure sending codes (email provider setup)

This version uses **Resend's Email API** as the OTP delivery provider. There is NO default email relay. A live provider account and a verified sending domain are required; simply hosting the website is insufficient to send emails.

1. Ask the appropriate corporate IT/security administrator for approval to email codes to employee `@mitesp.com` mailboxes using an external delivery service. If your organization requires Microsoft Graph or an internal mail relay instead, adapt the `app/api/auth/route.ts` sender before deployment.
2. Create or use an approved Resend account (https://resend.com). In Domains, add **a domain or subdomain your organization controls** (for example, an approved notifications subdomain). Configure the DNS records Resend asks for and wait until the sending domain is verified. Do not assume you are permitted to modify `mitesp.com` DNS.
3. Create a sending API key and keep its secret only in Vercel environment variables.
4. Decide the From address on the verified sender domain, e.g. `MITESP Shipyard <login@notify.example.com>`. **The sender domain can differ from `mitesp.com`; recipients MUST be at `@mitesp.com`.**
5. Test with one approved employee mailbox after deployment. If mail is blocked by corporate filtering, work with the mail/security admin rather than bypassing those rules.

## D. Required Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, add these as sensitive values for **Production**. Use Development/Preview only if you intend to test in those environments and have configured their permissions.

| Name | Value | Purpose |
| --- | --- | --- |
| `KV_REST_API_URL` | **Existing** Vercel KV REST endpoint | Connect to your *current* database |
| `KV_REST_API_TOKEN` | **Existing** KV write-enabled REST token | Used by all server-only data operations |
| `RESEND_API_KEY` | Your new Resend API key | Send 6-digit sign-in emails |
| `OTP_FROM_EMAIL` | `MITESP Shipyard <login@your-verified-domain>` | Verified and approved sender |
| `OTP_HASH_SECRET` | Long securely generated random string (32+ characters) | HMAC-hash one-time codes at rest |
| `SHIPYARD_ALLOWED_EMAILS` | Comma-separated exact addresses like `engineer1@mitesp.com,engineer2@mitesp.com` | **Strongly recommended** access allowlist |

The Vercel KV integration can provision the `KV_*` entries automatically. If your project uses different Upstash variable names, configure aliases to the names required by `@vercel/kv`; **do not create a second empty database**.

Create the secret in Windows PowerShell and copy its printed output into `OTP_HASH_SECRET`:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

The allowlist is optional in code, but important for production: without it, *any mailbox owner* at `@mitesp.com` can create a session and see/edit all customer infrastructure. There is no extra admin role system.

No Firebase, Google OAuth app secret or Entra app registration is needed for this new OTP login.

## E. Update the existing GitHub repository from Windows

Install **Git**, **Node.js 22** and an editor (VS Code optional). Do **not** replace/delete your existing repository's `.git` folder.

Option 1: you already have the repository cloned locally. Open PowerShell in the existing Git checkout:

```powershell
cd C:\path\to\noc-dashboard
git status
git pull origin main
git tag shipyard-before-email-otp
```

Option 2: you have no working checkout, clone it and enter the folder:

```powershell
git clone https://github.com/Senira-Wijesooriya/noc-dashboard.git
cd noc-dashboard
git tag shipyard-before-email-otp
```

Extract **`noc-dashboard-secure-v2.zip`**. Inside is the **`noc-dashboard-main`** folder. Copy the *contents* of that folder into your existing `noc-dashboard` checkout and replace same-named files. Keep the checkout's `.git` directory and **your `.env.local` file**. On Windows PowerShell you can use (adjust both paths):

```powershell
robocopy "C:\Users\YOU\Downloads\noc-dashboard-main" "C:\path\to\noc-dashboard" /E /XD node_modules .next .git /XF .env.local
```

Robocopy exit codes from 0 through 7 normally indicate success or nonfatal copying differences. It does not delete older source files. If your repository still includes obsolete `app/page - Copy.tsx` from the old deployment, delete it; that backup has previously caused a TypeScript production build error. Also remove any other obsolete `.tsx` backups that import removed Firebase exports.

**Do not place `.env.local`, any API key or your backup JSON under Git version control.** The `.env.example` file is placeholders only.

## F. Test locally BEFORE publishing

In the Git checkout run:

```powershell
npm ci
npm test
npm run build
npm run dev
```

Open http://localhost:3000. For local email login, copy `.env.example` to `.env.local` and fill the six configuration values using development credentials (including an approved sender). You can press Ctrl+C to stop `npm run dev` after testing.

Test: an approved company email receives a code, incorrect code fails, correct code signs in, logout prevents access, the dashboard loads actual stored clients, a safe test edit creates a recycle entry, Undo restores it, a client-specific report opens/exports, the full report includes all clients, and Force CP Sync displays valid values or marks failed sources as stale. Revert any test edits using Undo.

## G. Push to GitHub and deploy through Vercel

After `npm test` and `npm run build` succeed, and you have saved your pre-change Redis backup:

```powershell
git status
git add .
git commit -m "feat: corporate OTP login, secure asset API, JHF sync, recycle and reports"
git push origin main
```

Go to **Vercel → existing project → Deployments**. The push to `main` should start the new build automatically (as in your PDF). Confirm the deployment shows **Ready** and that the environment variables above are assigned to the production environment. If you added or changed variables after build, **redeploy** so the server picks them up. You should not need to recreate the Vercel project or move Redis data.

## H. Validate the LIVE site after deployment

1. Visit your existing live Vercel URL; the old Google/Firebase sign-in should now be replaced with the corporate email + verification-code form.
2. Request a code for a permitted `@mitesp.com` mailbox, check Inbox/Junk, enter the six digits within 10 minutes and sign in.
3. Try opening `/api/dashboard` in a separate signed-out browser/incognito window. It must return **401 Authentication required**, not customer data.
4. Check that **existing customers and gateways are unchanged**. If not, STOP: confirm the correct Vercel KV instance was used; do not add fake clients to work around a misconnected database.
5. Check ticker/source for R81.20, R82, R82.10 and R82.20. Click **Force CP Sync**. A failure should show stale/unavailable, not an invented number.
6. Create a temporary **test client** (not a real customer), delete it, then **Recycle Bin → Undo**. Also test adding and editing an asset, then undoing an edit.
7. Click **Report → All Clients → PDF / Print** and also export Excel (CSV). Repeat for one specific client. Note: the PDF button opens a print-friendly HTML page; choose **Save as PDF** in the print dialog.
8. Click **Backup** to download the authenticated JSON backup and store it securely; inspect that the existing `data:customers` contents are present.
9. Sign out; refresh and confirm you must verify again. A live session lasts up to **12 hours**; OTPs expire in **10 minutes** (maximum five incorrect attempts per code).

## I. Troubleshooting

- **"Email verification has not been configured"**: missing `RESEND_API_KEY`, `OTP_FROM_EMAIL` or `OTP_HASH_SECRET`; set them on the correct Vercel project and redeploy.
- **Code never arrives**: check sender-domain verification, provider logs, company filtering, recipient spelling, sender quotas and allowed API key. Codes are **never** displayed in browser responses or server logs.
- **401 from dashboard**: no valid session or a revoked/expired session. Verify again. OTP does not use the old Firebase account.
- **403 forbidden for mutation**: cross-origin attempt rejected or email not on allowlist; use your exact deployed site URL.
- **429**: code request cooldown, IP/mailbox request limit, or sync rate limit.
- **No assets found**: verify that the deployment uses the same existing KV endpoint/token and that `data:customers` is present. Never create demo data to fill this gap.
- **Sync not updating**: inspect Vercel Functions logs; outbound Check Point pages may be unavailable/blocked or have changed markup. Failed Takes are retained only as marked stale values; check the official per-release links in `lib/versions.ts`.
- **Cannot undo older changes**: an older ZIP did not save a post-change snapshot; the new server refuses unsafe undos. You can still restore a pre-deployment JSON backup manually with authorized change control.
- **Edit conflict 409**: somebody else modified the live database; refresh before saving to avoid overwriting their work.
- **Print button blocked**: allow pop-ups on your Vercel dashboard domain.

## J. Rollback and cautions

If the release has problems, redeploy the prior Vercel production deployment or revert the Git commit using a controlled change. **Do not simply delete Redis data.** Because old clients and newer versions may have changed the database, restore a snapshot only after comparing current records and obtaining authorization; rolling back code does NOT roll back data automatically.

The recycle bin stores only the most recent **200 changes**; it is not a substitute for periodic backups. Audit logs also retain 200 records. When a newer edit supersedes an older one, that older undo is intentionally blocked. Every signed-in allowlisted user has edit permission; deploy only to approved staff. Tokens and verification codes are server-only.

Official Check Point release pages (checked on 13 Nov 2026):
- R81.20: https://sc1.checkpoint.com/documents/Jumbo_HFA/R81.20/Downloads.html
- R82: https://sc1.checkpoint.com/documents/Jumbo_HFA/R82/Downloads.html
- R82.10: https://sc1.checkpoint.com/documents/Jumbo_HFA/R82.10/Downloads.html
- R82.20: https://sc1.checkpoint.com/documents/Jumbo_HFA/R82.20/Downloads.html

The published Takes found on that date were **173**, **132**, **52** and **10**, respectively; these are observations, **not** hard-coded targets. Always review Critical Information, target platform support, and customer-specific hotfixes before treating an update as suitable for production.

## K. Verification status in the prepared package

- TypeScript source syntax parsed.
- `npm test`: pure-function/unit tests for version scraping, inventory edits/undo, report escaping, installed Take parsing, and corporate email rule.
- **Not tested against live services:** actual Vercel deployment, your organization's Redis, email delivery, and browser actions (no production credentials were supplied).
- A full `npm ci` / Next.js production build could not run in the package-building environment because npm downloads were unavailable. **Run `npm ci`, `npm test` and `npm run build` in your own network before pushing.**
