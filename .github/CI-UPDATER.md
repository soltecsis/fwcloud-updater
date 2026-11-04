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

Deployment, security scanning, coverage reporting and SonarQube integration were
outside Phase 1. Phase 2 adds test reports and a reference coverage measurement,
as described in section 5. Phase 3 makes the suite hermetic and adds
authorization and HTTP integration tests, as described in section 6.

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
| 2 | Validated Jest/JUnit reports, execution metadata and a Node 22 coverage reference | Implemented; local verification recorded in section 5; GitHub acceptance pending | Every matrix cell uploads test evidence, Node 22 uploads validated coverage, failures preserve artifacts and the summary contains aggregates only |
| 3 | Hermetic unit tests, authorization coverage and an HTTP integration suite | Implemented; local verification recorded in section 6; GitHub acceptance pending | The suite passes inside and outside Git on Node 20/22/24, every authentication rejection branch is covered and unauthenticated HTTP requests cannot reach update execution |

Further CI extensions require separate scope and acceptance criteria.

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

## 5. Phase 2 — Test evidence and reference coverage

### 5.1. Commands and report scope

| Command | Purpose |
| --- | --- |
| `npm run test:ci` | Run Jest in CI mode with the default console reporter, `jest-junit` and native Jest JSON |
| `npm run test:coverage:ci` | Run that same suite once, adding LCOV, JSON summary, HTML and text-summary coverage reporters |
| `TEST_OUTCOME=success COVERAGE_EXPECTED=false npm run ci:reports` | Validate reports, write execution metadata and publish aggregate statistics |
| `npm run test:ci-tools` | Run automated validator and focused-test detection checks with Node's test runner |

`jest-junit` is pinned to `17.0.0`. The `pretest:ci` hook creates
`reports/tests/` and `reports/coverage/`, clearing earlier test/coverage evidence
and metadata first. This prevents an unsuccessful Jest startup from reusing a
previous successful run. `test:coverage:ci` delegates to `test:ci`, so it executes
the application suite only once. Neither command uses `--passWithNoTests`.

Jest's `rootDir` is now the repository root, with `roots` set to `src` and
`config`. The existing `.*\.spec\.ts$` discovery expression is unchanged.
Coverage includes `src/**/*.{ts,js}` and `config/**/*.ts`, excluding declarations
(`**/*.d.ts`) and specifications (`**/*.{spec,test}.{ts,js}`). The two config
factories contain executable application defaults and environment-variable
handling, so they belong in the coverage denominator. They add no test suites;
local discovery still finds exactly the same three specifications under `src`.

The `jest/no-focused-tests` ESLint rule from pinned `eslint-plugin-jest@29.17.0`
rejects `.only`, `fit`, `fdescribe` and parameterized focus. An additional syntax
selector covers `test.concurrent.only` / `it.concurrent.only`, including bracket
notation, which that plugin version does not recognize without `.each`.
`lint:check` runs this check in `quality`; `test:ci-tools` exercises the actual
configuration with focused and ordinary examples. Existing skipped tests remain
visible in the statistics.

### 5.2. Validation, metadata and privacy

`ci-context.cjs` reuses FWCloud API's helper from `ENS` revision `d4627b2` (with
local formatting). `ci-reports.cjs` adapts the Jest implementation from FWCloud
Websrv's `ENS` revision `fc87070`, retaining Updater's explicit source checkout
and removing database metadata. `saxes@6.0.0` provides strict XML parsing instead
of checking for a closing XML tag.

The validator rejects:

- Missing, empty, whitespace-only or malformed XML/JSON reports.
- Missing, negative, noninteger or inconsistent Jest counters and missing timing.
- Zero executed tests: only passed and failed tests count as executed; skipped
  and todo tests do not.
- Failed tests, failed suites, `success !== true`, JUnit failures/errors or a
  test step whose `TEST_OUTCOME` is not `success`.
- Disagreement between JUnit testcases/counters and native Jest counts. The
  pinned JUnit reporter includes todo testcases but excludes them from its
  `tests` and `skipped` counters; Jest JSON preserves both skipped and todo counts.
- Missing/invalid coverage when `COVERAGE_EXPECTED=true`, including invalid
  percentages/counts, empty source coverage, incomplete LCOV records, duplicate
  records, declaration/test sources or line/function/branch totals that disagree
  with the JSON summary. HTML must also be present and contain an HTML document.

`reports/metadata.json` is written even when validation fails. It records the
actual `git rev-parse HEAD`, repository/event/ref, run ID and attempt, collection
time, Node/npm versions, test outcome, native Jest counters, elapsed milliseconds,
coverage metrics and validation errors. Duration is the latest Jest suite end
minus the run's `startTime`, rather than the sum of parallel suite durations.
`ANALYSIS_COMMIT` must match the checkout; a mismatch fails validation and retains
the actual SHA in metadata.

A complete passing coverage execution also writes `reports/coverage/analysis.json`
with the same context and metrics plus `lcov.path` and `lcov.sha256`. The checksum
uses the actual LCOV bytes without newline normalization. A failed validation
removes any stale `analysis.json` and does not publish a successful baseline;
the raw reports remain available for diagnosis. No minimum coverage threshold is
configured in this phase.

The Actions summary contains only report status, aggregate suite/test counts,
skipped/todo counts, elapsed time and coverage percentages. It never interpolates
test names, failure messages, source code or parser error details. Detailed
failures stay in the logs and artifacts. Automated fixtures include sentinel
names and failure text to verify this boundary.

### 5.3. Matrix and artifacts

The `quality` job now also runs `test:ci-tools`. The test matrix remains Node
20/22/24, with no database service or database axis. Each cell builds first and
then invokes exactly one application test command:

| Node | Test command | Artifacts |
| --- | --- | --- |
| 20 | `test:ci` | `updater-tests-node20-<RUN_ID>-<ATTEMPT>` |
| 22 | `test:coverage:ci` | `updater-tests-node22-<RUN_ID>-<ATTEMPT>` and `updater-coverage-node22-<RUN_ID>` |
| 24 | `test:ci` | `updater-tests-node24-<RUN_ID>-<ATTEMPT>` |

The test artifact contains `tests/junit.xml`, `tests/results.json` and
`metadata.json`. The coverage artifact contains `lcov.info`,
`coverage-summary.json`, `index.html`, the supporting HTML assets and, only after
successful validation, `analysis.json`. Generated `/reports/` files are ignored
by Git.

Validation and both uploads use `!cancelled()` plus an attempted-test condition,
so they still run after test or validation failures. The test step has no
`continue-on-error`; its original failure continues to fail the matrix cell and
`updater-ci`. Setup/build failures do not claim to have executed tests, and
cancelled jobs are not guaranteed to publish artifacts.

Uploads use `actions/upload-artifact@v4`, `if-no-files-found: error` and 14-day
retention. Test names include the run attempt to preserve each attempt's evidence.
Coverage uses `overwrite: true` with a stable run ID so a partial rerun replaces
the earlier coverage artifact; `analysis.json` identifies the producing attempt.
Even failed reference executions attempt the coverage upload, preserving any
partial files and replacing earlier evidence for the same run.

Reporter configuration follows the [jest-junit documentation](https://github.com/jest-community/jest-junit#configuration).
Artifact replacement follows [upload-artifact's overwrite behavior](https://github.com/actions/upload-artifact/tree/v4#overwriting-an-artifact).

### 5.4. Reference measurement and local verification

Verified on 2026-11-04 in an isolated temporary Git repository containing the
implementation, based on Updater revision `8f8658b`. Its local verification
commit is `945be7523caa93f31e6a299c8f20f6433bc6301a`; this is the SHA recorded in
all three matrix reports and the reference `analysis.json`, not a published
Updater commit. Subsequent edits to this document record the measurements; the
executed source, configuration and CI scripts match that snapshot.

Each runtime used npm `11.21.1` and a clean `npm ci --no-audit --no-fund` with an
npm download cache. All installations added 665 packages without changing the
lockfile. npm reported the existing `allowScripts` warning for
`@parcel/watcher@2.6.0`; installation completed successfully.

| Node | Install | Build | Test command | Tests | Report validation | Duration (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| `20.20.0` | Passed | Passed | `test:ci` | 14 passed, 1 skipped, 0 todo | Passed | 5,124 |
| `22.22.3` | Passed | Passed | `test:coverage:ci` | 14 passed, 1 skipped, 0 todo | Passed | 9,540 |
| `24.19.0` | Passed | Passed | `test:ci` | 14 passed, 1 skipped, 0 todo | Passed | 4,608 |

All cells discovered 3 suites and 15 tests, with 14 executed and no failed tests
or suites. The Node 22 reference suite ran once with coverage enabled. Its
measurement is:

| Metric | Covered / total | Coverage |
| --- | --- | --- |
| Lines | 82 / 194 | 42.26% |
| Statements | 88 / 217 | 40.55% |
| Functions | 11 / 33 | 33.33% |
| Branches | 21 / 80 | 26.25% |

The measured line baseline is **42.26%**, replacing the earlier approximate
43% figure for the explicit scope used here. LCOV contains 12 source records,
including both configuration factories, with no declaration or specification
files. The config factories contribute 4 uncovered lines. The single skipped
test remains the existing `describe.skip` in
`src/updates/updates.controller.spec.ts`; it was not introduced by this phase.

Reference LCOV SHA-256:
`9265327f6b397e788c2ff9afe7d7bec415cd6009788ed2add6221fd9b982575a`.
The recorded collection time is `2026-11-04T09:23:30.438Z`. Local execution has
no GitHub run ID or attempt, so those fields are `null`; hosted executions take
their real values from `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`. Validator tests
also verify an explicit producing attempt and byte-exact checksum generation.

| Additional verification | Result |
| --- | --- |
| `test:ci-tools`, Node 22 | 65 passed; successful/failing reports, missing/malformed files, statistics, timing, coverage integrity, checksum, stale-analysis removal and focused-test detection |
| `lint:check` and `format:check`, Node 22 | Passed |
| Test discovery before/after changing Jest roots | Same 3 `src/**/*.spec.ts` files |
| Real failing-test fixture, Node 20 | Jest and validator returned 1; JUnit, JSON and metadata retained; summary excluded failure text |
| Real failed-suite fixture, Node 24 | Jest and validator returned 1; failed-suite evidence retained |
| No matching tests, Node 20 | Jest returned 1 without `--passWithNoTests`; earlier reports were cleared and validation wrote failing metadata |
| Python XML parser and independent LCOV SHA-256 calculation | All matrix XML parsed; Node 22 checksum matched `analysis.json` |
| Actionlint `1.7.7`, with unavailable ShellCheck disabled | Passed |
| `git diff --check` | Passed |

Local evidence and logs are retained under
`/tmp/fwcloud-updater-phase2-evidence/` for this workspace; they are not committed
reports or hosted Actions artifacts. Only the documentation records the initial
measurement in Git. No hosted run or artifact upload is claimed by these checks.

To reproduce the reference locally, select Node 22 and the pinned npm, run
`npm ci`, then `CI=true npm run test:coverage:ci`. After a successful execution,
run `TEST_OUTCOME=success COVERAGE_EXPECTED=true npm run ci:reports` and inspect
`reports/coverage/analysis.json`. The workflow supplies the actual test outcome
even when tests fail.

### 5.5. Hosted acceptance pending

- [ ] Record a complete Actions run against the final implementation commit,
  with all three matrix cells and `quality` successful.
- [ ] Download each `updater-tests-node<N>-<RUN_ID>-<ATTEMPT>` artifact and verify
  its XML, JSON, metadata, checkout SHA and runtime.
- [ ] Download `updater-coverage-node22-<RUN_ID>` and verify the HTML assets,
  metrics, producing attempt and independently computed LCOV checksum.
- [ ] Confirm test and validation failures retain artifacts and fail `updater-ci`.
- [ ] Partially rerun Node 22 and verify coverage replacement and the updated
  attempt, while earlier attempt-specific test artifacts remain available.
- [ ] Inspect successful and failed summaries for aggregate statistics only.

These hosted checks remain pending until the workflow is published and executed.

## 6. Phase 3 — Hermetic tests, authorization coverage and integration

### 6.1. Problem and approach

Before this phase, five `UpdatesService` tests required `git rev-parse` to succeed
in the configured fixture directories, so the suite failed outside a Git checkout.
Fixture paths also assumed that the working directory was the repository root.
`updates.controller.spec.ts` was disabled with `describe.skip`, both middlewares
had no tests and `test:e2e` matched no files.

Reproduction at revision `d3e1c5e`, in a copy without `.git`: 5 failed, 9 passed
and 1 skipped test.

No production code changed in this phase. The tests isolate external effects as
follows:

| Dependency | Isolation |
| --- | --- |
| Git branch lookup | `child_process.exec` is replaced with a Jest mock that keeps the other exports. Each test chooses the branch or Git error. |
| Version fixtures | Paths derive from the spec location (`__dirname`), not from `process.cwd()`. |
| Update commands | `child-process-promise.spawn` remains mocked. |
| Remote versions | `axios.get` remains mocked. Configured URLs use the reserved `.invalid` TLD. |
| Background update delay | Jest fake timers replace the earlier real 1.1-second waits. |
| Sessions | Synthetic JSON files are written under an `fs.mkdtempSync` directory in the OS temporary directory and removed in `afterAll`. |
| Logging in integration tests | `LogsService` is overridden, so no log files are written. |

Mocking `exec` was chosen over an injectable branch resolver because it covers
the existing `getGitBranch` implementation without changing the service's
dependency-injection contract.

### 6.2. Tests added or reactivated

| Suite | Coverage |
| --- | --- |
| `src/updates/updates.service.spec.ts` | Branch resolution and its error, the exact Git command and `cwd`, the remote URL built from the branch, Git and HTTP failures, version comparison, UI update failure (HTTP 405), and background API/websrv updates: no spawn before the delay, update then `start:bg`, the detached process is `unref`ed, and failed updates log without restarting |
| `src/updates/updates.controller.spec.ts` | `describe.skip` removed. Version info for all four components (including `null` results), each `PUT` delegating `runUpdate` with its `Apps` value, and error propagation |
| `src/middleware/auth.middleware.spec.ts` | Every rejection branch (table in 6.3) and the valid administrator path |
| `src/middleware/log-request.middleware.spec.ts` | Logs `<ip>\|HTTP/<version>\|<METHOD>\|<originalUrl>` before calling `next()` once with no arguments; frozen request and response objects prove that neither is modified |
| `test/updates.e2e-spec.ts` | Real `AppModule` (configuration, middleware registration and routing) plus `cookie-parser` registered as in `src/main.ts`, over real HTTP on `127.0.0.1` with an ephemeral port |

The integration suite overrides `UpdatesService` and `LogsService`, and sets
`API_INSTALL_DIR` to a temporary directory before compiling the module. With
`@nestjs/config` `4.0.4`, existing `process.env` values take precedence over a
local `.env` file. The original value is restored during teardown, along with
closing the application and removing the directory. Requests use `node:http`
with `agent: false`, so each connection closes after its response; no HTTP test
dependency was added.

### 6.3. Authorization evidence

Every `AuthMiddleware` rejection must produce HTTP 403, must not call `next()` and
must log the same error message.

| Scenario | Unit (`auth.middleware.spec.ts`) | Integration (`PUT /updates/api`) |
| --- | --- | --- |
| No cookies | 403 `No cookies found` | — (`cookie-parser` always defines cookies) |
| Missing or empty `FWCloud.net-cookie` | 403 | 403 on `PUT /updates/api`, `/ui`, `/websrv` and `GET /updates`; the service is never called |
| Malformed cookie: zero or several `:` / `.` separators | 403 `Bad cookie data` | — |
| `s:../outside.signature` with a valid admin session outside `sessions/` | 403 `Bad cookie data` | — |
| Nonexistent session file | 403 (`ENOENT`) | 403, `runUpdate` not called |
| Session file is not valid JSON, or has no `cookie` data | 403 | — |
| Expired session, `maxAge` `0` or `-1` | 403 `Session expired` | 403 (`maxAge` `0`), `runUpdate` not called |
| Missing `customer_id`, `user_id`, `username`, `pgp` or `admin_role` | 403 `Bad session data` | — |
| `admin_role: false` | 403 | 403, `runUpdate` not called |
| Valid administrator session | `next()` called once | `GET /updates` 200 with all four components; `PUT /updates/api` 200 and `runUpdate('api')` |

The successful integration cases show that the 403 responses come from
authentication, not from routing. Two temporary mutations confirmed that the
tests detect regressions; both were reverted:

| Mutation | Result |
| --- | --- |
| `AuthMiddleware` not registered in `AppModule` | 7 of 9 integration tests failed: every unauthenticated and unauthorized case |
| `admin_role` check never matches `false` | The unit and integration non-administrator tests failed |

### 6.4. Jest configuration

- `roots` now includes `<rootDir>/test`, and `testRegex` is
  `.*\.(e2e-)?spec\.ts$`. `test`, `test:ci` and `test:coverage:ci` therefore run
  the integration suite in the same Jest execution, JUnit/JSON reports and
  coverage. `test:e2e` runs only `test/*.e2e-spec.ts` through
  `test/jest-e2e.json`.
- `moduleNameMapper` maps `^src/(.*)$` to the source tree. The middlewares and
  `UpdatesModule` import `src/...`; `nest build` rewrites those paths, but Jest
  could not resolve them.
- `modulePathIgnorePatterns` excludes `test/DATA/` in both configurations. Those
  fixtures have duplicate package names and intentionally invalid JSON, which
  break Jest's module map once `test/` is a root.
- The `lint`, `format` and `format:fix` globs used `tests`, which does not exist.
  They now use `test`, so `jest/no-focused-tests` and Prettier also check the
  integration spec.
- No coverage threshold is configured.

### 6.5. Local verification

Verified on 2026-11-04. Each runtime used npm `11.21.1` and a separate copy of the
working tree **without `.git`**, `.env`, `logs/`, `dist/` or `reports/`, so the
tests could not reach a Git repository:

| Node | `npm ci` | `npm run build` | Test command | Result | `npm run test:e2e` |
| --- | --- | --- | --- | --- | --- |
| `20.20.0` | Passed | Passed | `test:ci` | 6 suites, 61 passed | 9 passed |
| `22.22.3` | Passed | Passed | `test:coverage:ci` | 6 suites, 61 passed | 9 passed |
| `24.19.0` | Passed | Passed | `test:ci` | 6 suites, 61 passed | 9 passed |

`ci:reports` failed in these copies with `Cannot verify the checked-out analysis
commit.`, as designed in Phase 2: it must record the checked-out commit. Each
copy was then committed to a throwaway local repository, snapshot
`f60223cd60ef745acceae023ef6229813e611c1a` (not a published commit). The test
command and `ci:reports` passed on all three runtimes, with 61 executed tests and
no skipped, todo or failed tests.

| Additional check | Result |
| --- | --- |
| Working directory outside the repository (Jest config with absolute `rootDir`) | Updates, middleware and integration suites: 60 passed; nothing written to the working directory |
| `jest --detectOpenHandles` on the integration suite | No open handles reported |
| Leftover `fwcloud-updater-auth-*` / `fwcloud-updater-e2e-*` temporary directories | None |
| `npm run lint:check` and `npm run format:check`, Node 22 | Passed |
| `npm run test:ci-tools`, Node 22 | 65 passed |
| `package-lock.json` | Unchanged |
| `git diff --check` | Passed |

### 6.6. Coverage

Reference execution: Node `22.22.3`, `test:coverage:ci` and `ci:reports` with
`COVERAGE_EXPECTED=true`, in the Git snapshot above, collected at
`2026-11-04T09:59:56.610Z`. The baseline is revision `d3e1c5e` measured under the
same conditions: committed snapshot, no `.env` and no `logs/` directory.

| Metric | Baseline `d3e1c5e` | Phase 3 |
| --- | --- | --- |
| Lines | 83 / 194 (42.78%) | 153 / 194 (78.86%) |
| Statements | 89 / 217 (41.01%) | 175 / 217 (80.64%) |
| Functions | 11 / 33 (33.33%) | 23 / 33 (69.69%) |
| Branches | 21 / 80 (26.25%) | 71 / 80 (88.75%) |

| File | Baseline lines / branches | Phase 3 lines / branches |
| --- | --- | --- |
| `src/middleware/auth.middleware.ts` | 0% / 0% | 100% (29/29) / 100% (23/23) |
| `src/middleware/log-request.middleware.ts` | 0% / — | 100% (6/6) / — |
| `src/updates/updates.controller.ts` | 57.14% / — | 100% (14/14) / — |
| `src/updates/updates.service.ts` | 88.57% / 94.73% | 97.14% (68/70) / 100% (19/19) |
| `src/app.module.ts` | 0% | 100% (11/11) |

Reference LCOV SHA-256:
`d0844ee9dc63a91229ddf292a7aa2a88463aef175db0aed19a838af63dc1feae` (12 source
records). The remaining uncovered lines in `updates.service.ts` are the
unreadable-directory branch of `runUpdate`. `src/main.ts` (0/34 lines) is not
exercised: the integration suite reproduces its `cookie-parser` registration but
does not run the HTTPS and PID-file bootstrap.

Two pre-existing paths make the totals depend on the environment.
`LogsService` creates `logs/` only when that directory is absent; fresh CI
checkouts have no `logs/`, while a development tree normally does, which accounts
for one line. A local `.env` also changes which `process.env.X || default`
branches of the configuration factories execute. Phase 2 recorded 82 lines
(42.26%) for the baseline, one line fewer than this measurement. Compare
coverage only between executions with the same `logs/` and `.env` conditions.

### 6.7. Remaining work

- `src/logs/logs.service.spec.ts` (unchanged) instantiates the real
  `LogsService`, which creates `logs/` and opens Winston file transports in the
  working directory. The new suites avoid this, but that spec still depends on a
  writable working directory.
- Hosted acceptance: record a complete Actions run against the final commit with
  61 tests per matrix cell, and confirm that the Node 22 artifact contains the
  integration suite's coverage.
