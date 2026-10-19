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

The [acceptance workflow](../.github/workflows/acceptance.yml) adds a separate job named `acceptance` on every pull request and push. Its required checks and artifact retention are documented in the [acceptance guide](../tests/acceptance/README.md#ci-integration). The `workflow-kit` job also runs the production acceptance hook as a step.

Protection verified on 2026-10-13: `main` requires `quality` and `acceptance`, requires up-to-date branches, and enforces the rules for admins. `acceptance` is bound to app ID `15368` (GitHub Actions). Force pushes and branch deletion are disabled. The `quality` app binding remains its original value.

The prerequisite [acceptance run on main](https://github.com/GetYourFit/getyourfit-prod/actions/runs/38394404459) passed at integration merge commit `6c13f165d66fd8e374127ceb192b0e5a53ed9ff2`. The `acceptance` job verified the good stub, all bad variants, and production start before the protection change. [Deployment inputs](deploy-inputs.md) records the separate hosting, vault, storage, and public-origin work.
