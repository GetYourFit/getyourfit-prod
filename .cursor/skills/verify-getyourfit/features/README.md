<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# GetYourFit verification map

Local responsive browser app, loopback Node service, and private Postgres account and wardrobe data. Read the baseline, then open a feature guide before driving that user path.

## Baseline

- Set a retained BETTER_AUTH_SECRET of at least 32 random characters, start a local database with npm run dev:db, export the DATABASE_URL it prints, run npm run dev, and open http://127.0.0.1:5173.
- Run npm run verify to check the browser app and data service readiness.
- Use chrome-devtools-axi and a named browser session for user-visible checks.
- npm run verify:local-account proves signup without email confirmation in the production build against a disposable Postgres database, the honest email-reset notice, a signed-in password change, restart continuity, sign-in failure, export, and deletion.
- npm run verify:wardrobe builds a production app and drives licensed real photos, fact review, outfit correction, export, ownership isolation, restart, and deletion. Use GYF_PROOF_DIR outside the repository to retain evidence.

## Features

- [Create and protect an account](./account-access.md) - Sign-in page at /sign-in.
- [Add and correct real garments](./wardrobe.md) - Wardrobe at /wardrobe after sign-in.
- [Choose one complete owned outfit](./outfit.md) - Outfit at /wardrobe#outfit after sign-in.
- [Export or delete your data](./data-control.md) - Account page at /account after sign-in.
