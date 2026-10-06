<!-- Generated from src/verification/features.json. Edit that file, then run npm run feature-map. -->
# GetYourFit verification map

Local responsive browser app, loopback Node service, and SQLite account data. Read the baseline, then open a feature guide before driving that user path.

## Baseline

- Run npm run dev with a disposable GYF_DATA_DIR and open http://127.0.0.1:5173.
- Run npm run verify to check the browser app and data service readiness.
- Use chrome-devtools-axi and a named browser session for user-visible checks.
- npm run verify:auth starts its own temporary production-mode service, isolated database, local mail catcher, and browser sessions.

## Features

- [Create and protect an account](./account-access.md) - Sign-in page at /.
- [Export or delete account data](./data-control.md) - Account page at / after sign-in.
