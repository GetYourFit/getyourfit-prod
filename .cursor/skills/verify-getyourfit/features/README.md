<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# GetYourFit verification map

Local responsive browser app, loopback Node service, and private SQLite account and wardrobe data. Read the baseline, then open a feature guide before driving that user path.

## Baseline

- Set a retained BETTER_AUTH_SECRET of at least 32 random characters, run npm run dev with a disposable GYF_DATA_DIR, and open http://127.0.0.1:5173.
- Run npm run verify to check the browser app and data service readiness.
- Use chrome-devtools-axi and a named browser session for user-visible checks.
- npm run verify:auth starts an isolated service and database, creates an ephemeral mailbox token for its Node runner, and drives named browser sessions.
- npm run verify:local-account proves signup without mail in the production build, restart continuity, sign-in failure, export, and deletion.
- npm run verify:wardrobe builds a production app and drives licensed real photos, fact review, outfit correction, export, ownership isolation, restart, and deletion. Use GYF_PROOF_DIR outside the repository to retain evidence.

## Features

- [Create and protect an account](./account-access.md) - Sign-in page at /.
- [Add and correct real garments](./wardrobe.md) - Wardrobe at / after sign-in.
- [Choose one complete owned outfit](./outfit.md) - Outfit at /#outfit after sign-in.
- [Export or delete your data](./data-control.md) - Account page at / after sign-in.
