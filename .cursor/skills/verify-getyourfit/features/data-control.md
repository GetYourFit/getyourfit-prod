<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# Export or delete account data

Download the current account record or delete the account and its credentials, sessions, tokens, and exact-recipient local email.

## Sub-features

- account-export downloads email, name, verification status, adult confirmation, and account creation time without password hashes or session secrets.
- account-delete removes the account and related credentials, sessions, tokens, lockout record, and in-memory mail.

## How to get to it (user POV)

- Sign in to open the account page.
- Choose Download export to save the account JSON.
- Choose Delete my data and confirm to remove the account.

## Driving it with chrome-devtools-axi

Preconditions:

- Sign in to a local account using the account-access guide.

- **Export.** Choose `Download export`. Inspect the saved JSON. It must identify `getyourfit-account-export-v1`, include the account profile fields, and omit password hashes and session secrets.
- **Delete.** Choose `Delete my data`, then `Erase permanently`. The app returns to sign-in. The verifier confirms that the deleted account cannot sign in, its exact-recipient messages are removed, and a message to a similar address remains.
- **Boundary.** This increment exports and deletes account records only. The final wardrobe acceptance remains pending until garment records and photos are included.
- **Proof.** `npm run verify:auth` checks export, deletion, session cleanup, exact-recipient mailbox cleanup, and rejected sign-in after deletion.

## Gotchas

- The account export intentionally excludes credentials and session tokens.
- Garment facts, photos, and outfit corrections are not implemented yet and are not included.
