# Progressive CI implementation for FWCloud Updater

## 1. Objective and scope

This document records the decisions, implementation and verification of the
reproducible CI pipeline for `fwcloud-updater`. Update it in the same branch and PR
as the workflow so that implementation and acceptance evidence stay together.

| Field | Value |
| --- | --- |
| Repository | `soltecsis/fwcloud-updater` |
| Initial revision | `8b0a580` |
| Integration target | `ENS` |
| Execution platform | GitHub Actions, GitHub-hosted Ubuntu runners |
| Last updated | 2026-11-04 |

Phase 1 covers dependency installation, code quality, builds, unit tests and a
stable required status check. It follows the Phase 1 structure of FWCloud API's
`.github/CI-BACKEND.md` and `.github/workflows/nodejs.yml`, with the npm pinning
approach established in FWCloud UI.

Deployment, security scanning, coverage reporting and SonarQube integration are
outside this phase.

## 2. Current technical decisions

- Declare `packageManager: "npm@11.21.1"` and `engines.node: ">=20"` in
  `package.json`; keep the root package's engine metadata aligned in the lockfile.
- Read the npm version from `package.json` and install it before `npm ci` in every
  job that needs project dependencies. The npm version bundled with Node is used
  only to bootstrap the declared npm version.
- Install CI project dependencies exclusively through `npm ci`. The global npm
  bootstrap is the only `npm install` command in the workflow.
- Cache npm downloads through `actions/setup-node@v5`, keyed by
  `package-lock.json`; do not cache `node_modules` or use a manual cache action.
- Run ESLint and Prettier once with Node 22. Build and test independently with
  Node 20, 22 and 24, selecting each runtime by major version through `setup-node`.
  The engine declaration does not guarantee compatibility with every historical
  patch release of Node 20: npm `11.21.1` requires `^20.17.0 || >=22.9.0`, and the
  locked ESLint requires `^20.19.0 || ^22.13.0 || >=24`.
- Validate the PR source commit, or the event commit for push/manual runs, and
  expose that SHA as `ANALYSIS_COMMIT`.
- Grant only `contents: read` and set `CI: true` at workflow level.
- Require `updater-ci` for branch protection after acceptance in GitHub. Record
  implementation and hosted execution evidence separately.

### Reported lockfile compatibility

At revision `8b0a580`, `npm ci` with npm `10.9.3` was reported to fail with
`Missing: webpack@5.112.2 from lock file`, while npm `11.21.1` succeeded. This is
the supplied compatibility report, not a new reproduction with npm 10.

Pinning npm makes the installation environment explicit across the matrix. This
phase preserves dependency versions and the existing dependency graph; the only
lockfile change is the root package's Node engine metadata.

## 3. Delivery plan

| Phase | Delivery | Status | Closure criterion |
| --- | --- | --- | --- |
| 1 | Reproducible installation, separate quality/test jobs, execution controls and `updater-ci` | Implemented and verified locally; GitHub acceptance pending | Local checks pass, a PR to `ENS` passes every required job, event/cancellation behavior is verified and branch protection requires `updater-ci` |

Future CI extensions require separate scope and acceptance criteria. No later
phase is implemented by this change.

## 4. Phase 1 — Reproducible CI foundation

### 4.1. Files changed

- [Workflow](workflows/nodejs.yml): installation, caching, jobs, events,
  permissions, concurrency and the aggregate check.
- [`package.json`](../package.json): pinned npm version and minimum Node major.
- [`package-lock.json`](../package-lock.json): matching root engine metadata.
- [This document](CI-UPDATER.md): decisions and verification evidence.

### 4.2. Installation and environment

Both `quality` and every `test` matrix job perform the same setup:

1. Check out `ANALYSIS_COMMIT` explicitly.
2. Select Node and restore the npm download cache through `actions/setup-node`.
3. Read the declared npm version and bootstrap it globally with
   `--ignore-scripts --no-audit --no-fund`.
4. Print the effective Node and npm versions in the job log.
5. Install project dependencies with `npm ci`.

The bootstrap flags apply to installing npm itself. Project installation uses
`npm ci` without adding `--ignore-scripts`.

### 4.3. Jobs and execution

| Job / status name | Work | Timeout |
| --- | --- | --- |
| `quality` / `FWCloud-Updater Quality` | Node 22, installation, `lint:check`, `format:check` | 20 minutes |
| `test` / `FWCloud-Updater Test (Node N)` | Node 20/22/24, installation, `build`, `test` | GitHub default |
| `updater-ci` | Require successful results from `quality` and the complete `test` matrix | 5 minutes |

Quality runs independently of the matrix. `fail-fast: false` allows other Node
versions to finish when a test job fails, preserving an individual result for
each version. No required job uses `continue-on-error`.

The aggregate job has `if: always()` and `needs: [quality, test]`. Its shell step
requires both results to equal `success`; failure, cancellation or an unexpected
skip fails the aggregate in runs that are allowed to complete. A deliberately
cancelled workflow can be reported by GitHub as cancelled instead of producing a
failed aggregate job.

### 4.4. Events, concurrency and revision

| Event | Scope |
| --- | --- |
| `push` | Branches `main`, `devel`, `ENS` |
| `pull_request` | Target branches `main`, `devel`, `ENS` |
| `workflow_dispatch` | Manual execution for a selected ref, once the workflow is available on the default branch |

There are no path filters or owner conditions that omit required jobs. The
concurrency group includes the workflow name, event name and PR number or ref.
Only PR runs use `cancel-in-progress`, so a new revision cancels an earlier run
of that PR without grouping unrelated PRs or event types together.

`ANALYSIS_COMMIT` is `${{ github.event.pull_request.head.sha || github.sha }}`.
Both dependency-consuming jobs check out that exact SHA. PR validation therefore
checks the source revision rather than GitHub's synthetic merge commit. Branch
protection should require the branch to be up to date with its base; configuring
and verifying that setting remains part of GitHub acceptance.

### 4.5. Local verification commands

Use a current patch release of each matrix major: Node 20, 22 and 24. Run the
following after selecting each runtime, preferably in an isolated checkout:

```bash
NPM_VERSION=$(node -p 'require("./package.json").packageManager.split("@")[1]')
npm install --global "npm@$NPM_VERSION" --ignore-scripts --no-audit --no-fund
node --version
npm --version
npm ci
npm run build
CI=true npm run test
```

With Node 22 selected and the same pinned npm/dependencies installed, also run:

```bash
npm run lint:check
npm run format:check
```

Validate the workflow and whitespace:

```bash
actionlint .github/workflows/nodejs.yml
git diff --check
```

### 4.6. Local verification evidence

Verified on 2026-11-04 using separate temporary copies of revision `8b0a580` with
the implementation changes applied. Each copy included Git metadata because the
existing version comparison tests query the current branch. Project dependencies
and generated builds in the development directory were not replaced.

| Node | npm | `npm ci --no-audit --no-fund` | `npm run build` | `CI=true npm run test` |
| --- | --- | --- | --- | --- |
| `20.20.0` | `11.21.1` | Passed | Passed | 14 passed, 1 skipped |
| `22.22.3` | `11.21.1` | Passed | Passed | 14 passed, 1 skipped |
| `24.19.0` | `11.21.1` | Passed | Passed | 14 passed, 1 skipped |

Each installation added 658 packages without changing its lockfile. npm reported
an `allowScripts` warning for `@parcel/watcher@2.6.0`; installation and all checks
completed successfully. The skipped test belongs to the pre-existing
`describe.skip` in `src/updates/updates.controller.spec.ts`; no tests were disabled
by this change.

| Additional check | Result |
| --- | --- |
| `npm run lint:check`, Node `22.22.3` / npm `11.21.1` | Passed |
| `npm run format:check`, same environment | Passed |
| Actionlint `1.7.7`, `actionlint -shellcheck= .github/workflows/nodejs.yml` | Passed; ShellCheck was unavailable and disabled |
| Workflow structure, event filters, concurrency, permissions, revision and install order parsed with PyYAML | Passed |
| Aggregate shell step under `bash -e -o pipefail` | All 16 combinations of `success`, `failure`, `skipped` and `cancelled` passed; only two successful results return zero |
| Lockfile comparison against the initial revision | Dependency graph and versions unchanged; only root engine metadata added |
| `git diff --check` | Passed |

The local installer suppressed audit/funding output; it did not use
`--ignore-scripts` for project installation. Execution logs and the local
verification harness were temporary files, not committed CI artifacts.

Local checks validate installation and commands on the listed runtimes and the
aggregate step's exit behavior. They do not establish that GitHub triggers,
cancellation or branch protection work as configured.

### 4.7. CI execution and acceptance evidence

No hosted execution or branch protection change is claimed by this local
implementation. Complete this record against the final implementation commit;
results for an earlier revision do not automatically validate later changes.

| Evidence | Reference / result |
| --- | --- |
| Implementation commits | `4b635b8` (npm and Node declarations), `cf3f589` (CI workflow); documentation included in this commit |
| PR targeting `ENS` | Pending publication |
| Complete Actions run and tested SHA | Pending |
| `FWCloud-Updater Quality` | Pending |
| `FWCloud-Updater Test (Node 20)` | Pending |
| `FWCloud-Updater Test (Node 22)` | Pending |
| `FWCloud-Updater Test (Node 24)` | Pending |
| `updater-ci` | Pending |
| Required check configured in branch protection | Pending |
| Acceptance reviewer and date | Pending |

- [ ] Confirm a valid PR to `ENS` runs quality, all three test jobs and
  `updater-ci`, with all jobs successful.
- [ ] Confirm the logged checkout SHA matches the intended source commit and
  every dependency-consuming job reports npm `11.21.1`.
- [ ] Push another revision to the same PR while its previous run is executing;
  record the cancelled run and its replacement.
- [ ] Verify a failed required job makes `updater-ci` fail. Verify an unexpectedly
  skipped required job also fails the aggregate in a controlled validation run.
- [ ] Verify push and PR branch filters, and a manual run when dispatch is
  available on the default branch. Confirm the job token has `contents: read`.
- [ ] Configure `updater-ci` as the required status check and require an up-to-date
  branch; remove obsolete required check names where applicable.
- [ ] Record the run links, final commit, branch protection evidence and reviewer.

The phase remains open for hosted acceptance until these items are verified.
