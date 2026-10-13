# Workflow kit adoption

GetYourFit vendors the workflow kit from `rvzaku/workflow` commit `00c27745d1dbc076667d4618d21f13c88e69b725`. This revision adds `adopt-product --no-hooks` after v0.1.0. Adoption used that option to preserve the worker's managed Git hooks. [.workflow/PROVENANCE](../.workflow/PROVENANCE) records the exact upstream commit, hashes of the vendored files, and the explicit local hook opt-out.

The [workflow-kit workflow](../.github/workflows/workflow-kit.yml) runs on pull requests and pushes to `main`, plus a weekly schedule. It checks secrets, action pins, plain dashes, commit attribution, hook wiring, and provenance, then runs the acceptance hook below as a step of the same job. CI enforces every kit check even when local hooks are opted out. Vendored files must be updated through the upstream adopter; do not edit them in this repository.

The product owns [.workflow/acceptance](../.workflow/acceptance). It installs both locked npm dependency sets and Chromium, then runs the independent acceptance suite against a production build launched with `npm start`. The hook exits unsuccessfully on any mandatory failure. It runs under [.workflow/require-node](../.workflow/require-node), which reads the Node.js floor from `package.json` engines and, when the runtime is older or missing, re-runs under a pinned Node.js from `npm exec`, failing with a clear message if that is still too old. It requires npm, and network access for installation; on Linux, Playwright's system-dependency installation also requires permission to install packages. Reports use temporary storage by default, or the caller's `ACCEPTANCE_OUTPUT` directory. The suite uses disposable account storage, generates credentials per run, and sends no real mail.

To check an adopted clone:

```sh
python3 .workflow/checks.py
.workflow/acceptance
```

Local Git hooks are explicitly opted out for this adoption. A clone owner with authority to replace its hook configuration can run `python3 .workflow/checks.py install-hooks`; owners of managed hooks can chain `.workflow/hooks/pre-commit` and `.workflow/hooks/pre-push` instead. The commit hook checks the kit; the push hook also runs production acceptance.

This adoption adds a `workflow-kit` CI job that includes the acceptance hook as a step. A separate `acceptance` job, good-stub and bad-variant verification, and making `acceptance` required beside `quality` are subsequent integration steps. This change does not deploy the application.
