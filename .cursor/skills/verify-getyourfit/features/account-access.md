<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Create and protect an account

Create an adult email/password account, sign in, change the password while signed in, and add optional TOTP protection. Email confirmation and email password reset are off until a mail provider is connected.

## Sub-features

- account-create accepts explicit 18+ confirmation and creates a signed-in, email-unverified account.
- account-password changes the password while signed in, requires the current password, and signs out other devices.
- account-totp supports authenticator setup, one-time backup codes, and a sign-in challenge.
- account-sessions ends the current session or revokes every active session.

## How to get to it (user POV)

- Open the local app and choose Create an account or enter credentials to sign in.
- No email is sent. New accounts sign in immediately with an unverified address, and Forgot password? explains that email reset is not available yet.
- After sign-in, use the account page to change the password or configure an authenticator app.

## Driving it with chrome-devtools-axi

Preconditions:

- Install dependencies with npm install. Set BETTER_AUTH_SECRET once to a random key of at least 32 characters and reuse it with the database.
- Run npm run verify:local-account for isolated production browser coverage against a disposable Postgres database.

- **Create.** Choose Create an account, enter a name, email, and password of at least 12 characters, confirm the 18+ statement, and choose Create account. The wardrobe appears without a mail link. Signup without consent must fail.
- **Sign in.** Sign out and use the same credentials. An incorrect password fails. Restart the service with the same database and key; the existing session must still work.
- **Recovery boundary.** Choose Forgot password? on the sign-in page: it says reset links cannot be emailed yet. The reset and verification API routes return 503 EMAIL_NOT_AVAILABLE and create no token. While signed in, Account > Change password takes the current password and a new one.
- **TOTP.** Enter the password and choose Set up authenticator. Confirm an invalid code fails and a current code works. Restart with the retained key, then sign out and prove sign-in requests the second code.

## Gotchas

- Email is not connected, so emailVerified stays false and a forgotten password cannot be recovered. Turning email on later is documented in docs/supabase.md.
- Retain the authentication key with the database. A missing key refuses startup; changing it breaks encrypted authenticator state and sessions.
- Signup cannot hide whether an address is already registered, because no email proves ownership.
