<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Create and protect an account

Create an adult account, verify email locally, sign in, recover access, and add optional TOTP protection.

## Sub-features

- account-create accepts an explicit 18+ confirmation and requires a verified email before sign-in.
- account-verify consumes a current local verification link once.
- account-recovery uses a hashed, expiring, single-use token and revokes sessions after reset.
- account-totp supports authenticator setup, one-time backup codes, and a sign-in challenge.
- account-sessions ends the current session or revokes every active session.

## How to get to it (user POV)

- Open the local app and choose Create an account or enter credentials to sign in.
- Run npm run verify:auth to exercise verification and recovery; browser users cannot read local mail.
- After sign-in, use the account page to configure an authenticator app.

## Driving it with chrome-devtools-axi

Preconditions:

- Install dependencies with `npm install`.
- Run `npm run verify:auth`; it builds and starts the local service, reads mail through its private Node process, and opens links in named browser sessions.

- **Create.** Choose `Create an account`, enter a name, email, and 12-character-or-longer password, confirm the 18+ statement, and choose `Create account`.
- **Verify.** The verifier opens the current email link in the browser. The account page appears. Reopen the link; it must report an invalid token and create no extra session. A browser request to `/__mail` must return no messages.
- **Sign in.** Sign out, enter the same email and password, and choose `Sign in`. An unverified or invalid account must not start a session.
- **Recover.** Choose `Forgot password?`, request a link, and have the verifier open it in the browser. Set a new password. Reuse and expire the token; both must fail.
- **TOTP.** On the account page, enter the password and choose `Set up TOTP`. Confirm an invalid code fails, then confirm a current code. Sign out and prove sign-in requests the second code.
- **Proof.** Run `npm run verify:auth` for isolated browser coverage of registration, recovery, origin and rate controls, concurrent sessions, TOTP, revocation, export, deletion, and offline messaging.

## Gotchas

- The local mail catcher stores messages in process memory and sends nothing externally. Only the verifier's Node process has its ephemeral bearer token; ordinary and signed-in browser users cannot read messages.
- Verification and recovery links are single-use and expire.
- The app is account-only at this stage; garment photos and wardrobe data arrive later.
