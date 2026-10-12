<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Create and protect an account

Create an adult email/password account without mail in v0.1, sign in, and add optional TOTP protection. Verification and recovery delivery are sequenced for v0.2.

## Sub-features

- account-create accepts explicit 18+ confirmation and creates a signed-in, email-unverified account in default mode.
- account-verify consumes a current local verification link once.
- account-recovery uses a hashed, expiring, single-use token and revokes sessions after reset.
- account-totp supports authenticator setup, one-time backup codes, and a sign-in challenge.
- account-sessions ends the current session or revokes every active session.

## How to get to it (user POV)

- Open the local app and choose Create an account or enter credentials to sign in.
- The default mode sends no mail. New accounts sign in immediately with an unverified address. The preserved opt-in SMTP mode requires email verification; its isolated verifier uses a private mailbox that only the Node runner can read.
- After sign-in, use the account page to configure an authenticator app.

## Driving it with chrome-devtools-axi

Preconditions:

- Install dependencies with npm install. Set BETTER_AUTH_SECRET once to a random key of at least 32 characters and reuse it with the database.
- Use default GYF_MAIL_TRANSPORT=disabled for v0.1. Run npm run verify:local-account for isolated production browser coverage.

- **Create.** Choose Create an account, enter a name, email, and password of at least 12 characters, confirm the 18+ statement, and choose Create account. The account page appears without a mail link. Signup without consent must fail.
- **Sign in.** Sign out and use the same credentials. An incorrect password fails. Restart the service with the same database and key; the existing session must still work.
- **Recovery boundary.** Default mode has no Forgot password control. A reset request returns 404 and creates no token. Browser requests to /__mail return 404.
- **TOTP.** Enter the password and choose Set up TOTP. Confirm an invalid code fails and a current code works. Restart with the retained key, then sign out and prove sign-in requests the second code.
- **Opt-in email path.** npm run verify:auth exercises verification/replay, recovery expiry/reuse, origin/rate controls, TOTP, revocation, export, deletion, and offline messaging. It uses restricted test mail and controlled SMTP, without contacting a real provider.

## Gotchas

- Default mode sends no mail, keeps emailVerified=false, and cannot recover a forgotten password. Real mail delivery is v0.2.
- Retain the authentication key with the database. A missing key refuses startup; changing it breaks encrypted authenticator state and sessions.
- Opt-in SMTP requires STARTTLS unless implicit TLS is selected. Test mode requires a private runner token. Browser users cannot read its mailbox.
- Photo upload and outfit decisions remain pending in this account increment.
