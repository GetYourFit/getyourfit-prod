<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Create and protect an account

Create an adult account, verify email, sign in, recover access, and add optional TOTP protection.

## Sub-features

- account-create accepts an explicit 18+ confirmation and requires a verified email before sign-in.
- account-verify consumes a current local verification link once.
- account-recovery uses a hashed, expiring, single-use token and revokes sessions after reset.
- account-totp supports authenticator setup, one-time backup codes, and a sign-in challenge.
- account-sessions ends the current session or revokes every active session.

## How to get to it (user POV)

- Open the local app and choose Create an account or enter credentials to sign in.
- In normal SMTP mode, receive links at the account email. The isolated verifier uses a private mailbox that only its Node runner can read.
- After sign-in, use the account page to configure an authenticator app.

## Driving it with chrome-devtools-axi

Preconditions:

- Install dependencies with `npm install`. Configure `SMTP_HOST` and `SMTP_FROM` before starting a real-user instance.
- Run `npm run verify:auth`; it builds and starts the local service, reads test mail through its private Node process, and opens links in named browser sessions.

- **Create.** Choose `Create an account`, enter a name, email, and 12-character-or-longer password, confirm the 18+ statement, and choose `Create account`.
- **Verify.** Follow the current link sent to the account email, or let the isolated verifier open its test message in the browser. The account page appears. Reopen the link; it must report an invalid token and create no extra session. A browser request to `/__mail` must return no messages.
- **Sign in.** Sign out, enter the same email and password, and choose `Sign in`. An unverified or invalid account must not start a session.
- **Recover.** Choose `Forgot password?`, request a link, and use it to set a new password. Reuse and expire the token; both must fail.
- **TOTP.** On the account page, enter the password and choose `Set up TOTP`. Confirm an invalid code fails, then confirm a current code. Sign out and prove sign-in requests the second code.
- **Proof.** Run `npm run verify:auth` for isolated browser coverage of registration, recovery, origin and rate controls, concurrent sessions, TOTP, revocation, export, deletion, and offline messaging. SMTP checks use a controlled local relay and do not prove delivery through a real provider.

## Gotchas

- Normal mode uses SMTP and requires STARTTLS unless implicit TLS is selected. Automated tests can enable a separate in-memory catcher; only the verifier's Node process has its ephemeral bearer token, and browser users cannot read messages.
- Verification and recovery links are single-use and expire.
- This intermediate account-only increment is not product-ready. Real garment photos, wearer corrections, wardrobe management, and complete outfit decisions remain required to complete the first slice.
