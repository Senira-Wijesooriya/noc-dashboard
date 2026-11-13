# Changes from noc-dashboard-updated.zip

- Switched from Google/Firebase + self-declared office mail to passwordless verification of a real company mailbox; server-side OTP, rate limits, sessions, cross-origin checks, and optional email allowlist.
- Closed unauthenticated read/write endpoints and removed all client-supplied user/IP identity for audit entries.
- Replaced whole-state undos with conflict-checked, atomic compare-and-swap changes in the existing KV store; preserved legacy data keys and stopped seeding fake client records.
- Corrected latest-take parsing and added status/error indicators; retained previously successful published Takes only when marked as stale after a source failure.
- Kept R81.20/R82/R82.10/R82.20 options, with official per-version sources.
- Kept client/all-client HTML-to-PDF/CSV reports; added safer installed Take parsing, CSV formula protection, and stale-target handling.
- Added session-protected JSON backup, non-destructive update/rollback documentation and unit tests.
- Preserved orange/charcoal visual theme and existing asset types (Cluster HA, Single GW, MGMT).

**Limitations:** verification requires external email sender configuration; latest JHF is not an automatic upgrade recommendation; this release does not provide individual roles or permanent unlimited history; no live Vercel/email end-to-end test performed.
