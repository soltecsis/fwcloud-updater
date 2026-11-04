# Progressive CI implementation for FWCloud Updater

## 1. Objective and scope

This document records the decisions, implementation and verification of the
CI pipeline for `fwcloud-updater`. Update it in the same branch and PR
as the workflow so that implementation and acceptance evidence stay together.

| Field | Value |
| --- | --- |
| Repository | `soltecsis/fwcloud-updater` |
| Initial revision | `8b0a580` |
| Integration target | `ENS` |
| Execution platform | GitHub Actions, GitHub-hosted Ubuntu runners |
| Reviewed integration revision | `04e39b3adf742f259611d017891e3f28903d2899` on `ENS` |
| Acceptance and rollout | Open; effective branch protection and hosted negative cases are not verified |
| Last updated | 2026-11-04 |

Phase 1 covers dependency installation, code quality, builds, unit tests and a
stable required status check. It follows the Phase 1 structure of FWCloud API's
`.github/CI-BACKEND.md` and `.github/workflows/nodejs.yml`, with the npm pinning
approach established in FWCloud UI.

Deployment, security scanning, coverage reporting and SonarQube integration were
outside Phase 1. Phase 2 adds test reports and a reference coverage measurement,
as described in section 5. Phase 3 makes the suite hermetic and adds
authorization and HTTP integration tests, as described in section 6. Phase 4
adds Gitleaks secret detection and the initial history audit, as described in
section 7. Phase 5 adds dependency SCA and an SBOM, following FWCloud API's
Phase 4 Trivy configuration and evidence conventions, as described in section 8.
The SonarQube integration follows API Phase 7 and is recorded in section 9.

The current hosted evidence register, protection assessment and rollout state
are in [section 10](#10-hosted-evidence-protection-and-rollout). Earlier local
measurements remain historical evidence; they do not establish hosted acceptance.
Here, **implemented** means code exists at the referenced commit, **deployed**
means it has executed on a named branch, and **verified** means the specified
evidence was inspected. A merged PR or a successful run alone does not close a
phase. No phase has final acceptance while its listed closure items remain open.

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
| 1 | Reproducible installation, separate quality/test jobs, execution controls and `updater-ci` | Deployed on `ENS`; successful jobs verified; protection/cancellation acceptance open | Local checks pass, a PR to `ENS` passes every required job, event/cancellation behavior is verified and branch protection requires `updater-ci` |
| 1b | Extended ESLint/Prettier coverage for configuration and CI scripts | Deployed on `ENS`; successful quality job and logs verified | Extended checks execute without changing application behavior; final protected rollout accepted |
| 2 | Validated Jest/JUnit reports, execution metadata and a Node 22 coverage reference | Deployed on `ENS`; successful artifacts reviewed; hosted failure/rerun/retention checks open | Every matrix cell uploads test evidence, Node 22 uploads validated coverage, failures preserve artifacts and the summary contains aggregates only |
| 3 | Hermetic unit tests, authorization coverage and an HTTP integration suite | Deployed on `ENS`; 61 tests per cell and coverage verified; final acceptance open | The suite passes inside and outside Git on Node 20/22/24, every authentication rejection branch is covered and unauthenticated HTTP requests cannot reach update execution |
| 4 | Gitleaks secret detection without repository-controlled suppressions, sanitized evidence and an initial history audit | Deployed on `ENS`; sanitized push artifact reviewed; hosted negative/full-history checks open | Every event scans its intended range, findings and scanner errors fail `updater-ci`, only aggregate metadata is published and the hosted `workflow_dispatch` audit outcome is recorded |
| 5 | Dependency SCA and CycloneDX SBOM with verified Trivy | Deployed on `ENS`; successful scan/SBOM reviewed; hosted failure checks open | Runtime/development inventories agree, HIGH/CRITICAL findings and incomplete scans block `updater-ci`, and security evidence is retained on failure |
| 6 | SonarQube Cloud and blocking Quality Gate (API Phase 7) | Deployed on `ENS`; coverage import and passing gate verified; server configuration/negative checks open | Eligible executions pass the assigned gate; failure, exclusion and coverage-rerun evidence reviewed |
| 7 | Effective protection, evidence acceptance and rollout | Documentation and 90-day test/coverage requests implemented locally; protection and promotion pending | `ENS`/`main` enforce `updater-ci`, acceptance evidence is complete, `main` passes and `devel` is aligned |

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

The original local implementation has now executed in GitHub. The successful
path below was checked on 2026-11-04 by Codex (automated evidence review);
full acceptance remains pending. Full per-phase references and remaining
checks are recorded in section 10. Results for this revision do not automatically
validate the subsequent retention/documentation changes.

| Evidence | Reference / result |
| --- | --- |
| Implementation commits | `4b635b8` (npm and Node declarations), `cf3f589` (CI workflow); documentation included in this commit |
| PR targeting `ENS` | [#104](https://github.com/soltecsis/fwcloud-updater/pull/104), merged; head `f630222f19316587ac30a89b84fe9a12518a8114` |
| Complete Actions run and tested SHA | [41826696674, attempt 1](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674), `04e39b3adf742f259611d017891e3f28903d2899` |
| `FWCloud-Updater Quality` | Success; lint, format and CI tooling steps successful |
| `FWCloud-Updater Test (Node 20)` | Success; Node `20.20.2`, npm `11.21.1`, 61 passed |
| `FWCloud-Updater Test (Node 22)` | Success; Node `22.23.4`, npm `11.21.1`, 61 passed |
| `FWCloud-Updater Test (Node 24)` | Success; Node `24.22.1`, npm `11.21.1`, 61 passed |
| `updater-ci` | Success; GitHub Actions app `15368`, intended workflow/run/job verified |
| Required check configured in branch protection | Not verified; API reports both target branches unprotected, protection read returns 403 |
| Acceptance reviewer and date | Responsible reviewer: Codex (automated), 2026-11-04; no maintainer sign-off claimed |

- [x] Confirm a valid PR to `ENS` runs quality, all three test jobs and
  `updater-ci`, with all jobs successful.
- [x] Confirm the logged checkout SHA matches the intended source commit and
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

Uploads use `actions/upload-artifact@v4`, `if-no-files-found: error` and request
90-day retention. The reviewed `ENS` revision still requested 14 days for these
artifacts; the 90-day change is local and requires a new hosted run and expiry
check (section 10.5). Test names include the run attempt to preserve each attempt's evidence.
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

### 5.5. Hosted acceptance

- [x] Record a complete Actions run against the deployed implementation commit,
  with all three matrix cells and `quality` successful.
- [x] Download each `updater-tests-node<N>-<RUN_ID>-<ATTEMPT>` artifact and verify
  its XML, JSON, metadata, checkout SHA and runtime.
- [x] Download `updater-coverage-node22-<RUN_ID>` and verify the HTML assets,
  metrics, producing attempt and independently computed LCOV checksum.
- [ ] Confirm test and validation failures retain artifacts and fail `updater-ci`.
- [ ] Partially rerun Node 22 and verify coverage replacement and the updated
  attempt, while earlier attempt-specific test artifacts remain available.
- [ ] Inspect successful and failed summaries for aggregate statistics only.

The successful execution and artifact review are recorded in section 10. Failure,
partial-rerun, summary and new-retention acceptance remain open.

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
- Hosted successful-path evidence: run `41826696674`, reviewed in section 10,
  executes six suites and 61 tests in every matrix cell. Its Node 22 report
  includes the integration suite and matches the Phase 3 reference coverage.
  Final acceptance and protected rollout remain open.

## 7. Phase 4 — Secret detection with Gitleaks

### 7.1. Tool and integrity

Gitleaks `8.30.1` runs in the dedicated `secrets` job (`FWCloud-Updater Secrets`,
15-minute timeout). It is not an npm dependency, and the Gitleaks GitHub Action is
not used. The job adapts FWCloud API's `secrets` job (`ENS`) and adds the
suppression hardening from FWCloud UI's `secrets-repo` job. It also closes gaps
found while verifying this phase, which affect both reference jobs (7.2 to 7.4).

```text
Version: 8.30.1
Archive: gitleaks_8.30.1_linux_x64.tar.gz
SHA-256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
```

The official release archive is downloaded with `curl --fail`, restricted to
HTTPS/TLS 1.2+, and checked with `sha256sum --check --strict` before only the
`gitleaks` binary is extracted. `gitleaks version` must then report the pinned
version. A download failure, checksum mismatch or version mismatch fails the job
before the binary runs.

The checkout uses `ANALYSIS_COMMIT`, `fetch-depth: 0` and
`persist-credentials: false`, so the downloaded binary never runs with the job
token stored in the Git configuration.

### 7.2. Configuration and suppressions

`.gitleaks.toml` declares `minVersion = "v8.30.1"` and extends that release's
default rules (`[extend] useDefault = true`). It has no allowlists, path
exclusions, custom rules or baseline.

Gitleaks `8.30.1` scans the output of `git -C . log -p -U0 <log options>`.
Without the following controls, repository content could silence a finding or
keep the content out of that patch:

| Mechanism | Control |
| --- | --- |
| `.gitleaksignore` at the repository root | The scan step fails if the file exists, as a file, a symlink or a dangling symlink. Gitleaks still applies it when `--gitleaks-ignore-path` names another file. It does not read `.gitleaksignore` files in subdirectories |
| Ignore file | `--gitleaks-ignore-path` points to an empty file created in `$RUNNER_TEMP` |
| Inline `gitleaks:allow` comments | `--ignore-gitleaks-allow` |
| Baseline | No `--baseline-path` |
| `.gitattributes` with `-diff` or `binary` at any level, or a file Git detects as binary (a NUL byte) | `--text` in the log options. Otherwise Git prints only `Binary files ... differ` |
| `.gitattributes` with `diff=<driver>`, when Git configuration defines a textconv command for that driver | `--no-textconv`: the patch shows the committed bytes, not converted text |

Without its control, each mechanism made the scan pass with exit code 0 and no
findings (7.7). The `.gitattributes`, NUL-byte and textconv cases also affect
FWCloud API and UI, which pass none of these log options.

The scan uses the `.gitleaks.toml` from the analyzed revision. Changes to it or
to the workflow remain part of the reviewed diff.

### 7.3. Scan scope

| Event | Range | Recorded scope |
| --- | --- | --- |
| `pull_request` | `<merge-base>..<head>`, from `pull_request.base.sha` and the PR head | `pull-request:<range>` |
| `push` | `<before>..<sha>` | `push:<range>` |
| Push creating a branch (`before` is all zeros) | `<sha>`: all history reachable from the branch head | `new-branch-history:<sha>` |
| `workflow_dispatch` | `--all`: every branch and tag fetched by the checkout | `full-history` |

Every scope runs with `--log-opts="--text --no-textconv --remerge-diff <range>"`.
A secret added in one PR commit and removed in a later one is detected even
though the final tree is clean.

`git log -p` prints no patch for merge commits, so FWCloud API and UI do not scan
content added while making a merge. `--remerge-diff` (Git 2.36 or later) shows
how each merge differs from Git's automatic re-merge of its parents. Content
added in a conflict resolution or in an otherwise clean merge is scanned; content
merged unchanged from either parent is not scanned again.
`--diff-merges=first-parent` was rejected: a PR that merges its base branch would
rescan that branch's history.

The scope step requires 40-character SHAs, a non-shallow clone, a checkout equal
to `ANALYSIS_COMMIT`, existing commit objects and, for PRs, a merge base. Any
other event, a missing `before` or base commit, unrelated histories or a shallow
clone fail the job. The scan never falls back to a smaller range. A force push
whose previous revision is no longer fetched therefore fails, and its replacement
history must be covered by a manual `--all` run.

`dist/` is not scanned: the Updater CI publishes no distribution artifact.

### 7.4. Results and evidence

The scan step first removes `reports/secrets/`, so committed or stale reports
cannot be reused. It writes a redacted JSON report (`--redact=100`) to
`reports/secrets/gitleaks.json` under umask `077` and records the exit code
without failing.

Gitleaks runs with `--log-level error` and without `--verbose`, so a complete
scan prints nothing. Its output is captured in `$RUNNER_TEMP`, printed to the job
log and counted. Gitleaks `8.30.1` exits `0` with an empty report when `git log`
fails, for example on a missing object or an invalid revision. That output is the
only signal, so the classifier treats any line as an error. The printed lines are
Gitleaks and Git error messages; findings are never printed.

`scripts/gitleaks-report.cjs` classifies the result:

| Status | Condition |
| --- | --- |
| `success` | Exit code `0`, an empty report array and no scanner output |
| `findings` | Exit code `1`, a non-empty array whose entries all carry a valid rule id, and no scanner output |
| `error` | Missing or invalid report, exit code or line count; any other exit code; `0` with findings; `1` without findings; an invalid entry; any scanner output; or a checkout that differs from `ANALYSIS_COMMIT` |

Only `success` lets the job pass. A timeout or Git failure produces scanner
output, so a partial scan is reported as `error` even when it found secrets.

`reports/secrets/metadata.json` contains the shared CI context (schema version,
collection time, repository, actual checkout commit, event, ref, run ID and
attempt). It also records the Gitleaks version, scan scope, log options, exit
code, scanner log line count, status, finding count (`null` when the report is
unreadable), sorted unique rule ids and fixed-text errors. A test pins this field
set. The step summary shows the commit, scope, version, status, count and rule
ids.

Differences from FWCloud API's collector, each covered by a test:

- Scanner output is an `error`. The API collector accepts exit code `0` with an
  empty report after a Git failure.
- Report read errors use fixed messages. Node's `JSON.parse` quotes short invalid
  input in its error (for example `"src/private/path.ts" is not valid JSON` on
  Node 22), and the API collector copies that message into metadata.
- Rule ids must match `^[a-z0-9][a-z0-9._-]{0,99}$` (case-insensitive), as all
  222 default rule ids of Gitleaks `8.30.1` do. Null, non-object or rule-less
  entries are an `error` instead of a crash without metadata.
- A checkout mismatch is recorded as an `error` with the actual commit, as
  `ci-reports.cjs` does, instead of exiting without metadata.
- An unreadable report yields `findingCount: null`, not `0`.

The cleanup step always runs. It removes the detailed report, the ignore file and
the captured output, then checks that the report is gone. The upload publishes
only `reports/secrets/metadata.json` as `updater-secrets-<RUN_ID>-<ATTEMPT>`,
with `if-no-files-found: error` and a requested retention of 90 days. As in
FWCloud API, it uses `actions/upload-artifact` pinned to
`ea165f8d65b6e75b540449e92b4886f43607fa02` (`v4.6.2`). Verification and upload
run unless the run is cancelled or the scan never started, so findings and
scanner errors still publish metadata. Installation and scope failures fail the
job without metadata.

`updater-ci` now needs `quality`, `test` and `secrets`, and requires `success`
from each.

### 7.5. Initial history audit

Executed locally on 2026-11-04 with the verified binary, the versioned
configuration and the job's options: `--text --no-textconv --remerge-diff`, an
empty ignore file, `--ignore-gitleaks-allow`, `--redact=100` and
`--timeout 300`, with `--log-level info` to record the counts. Remote-tracking
refs were last fetched at 11:20 (+01:00), when `origin/ENS` was `afc1cd7`. The
clone is not shallow.

| Scope | Commits | Merge commits | Scanned by Gitleaks | Volume | Findings | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| `--remotes=origin --tags`, what `--all` covers after the CI checkout | 169 | 42 | 127 | ~2.07 MB | 0 | 0 |
| `--all` in the development clone, adding two local stash commits | 171 | 43 | 128 | ~2.07 MB | 0 | 0 |
| `origin/devel` (`8b0a580`) | 138 | 38 | 100 | ~1.97 MB | 0 | 0 |

The plan's "approximately 138 commits" is `origin/devel`'s count, merges
included. Gitleaks counts commits that produce a patch: non-merge commits with
changes, and merges whose re-merge differs. None of the 42 published merges adds
content of its own; the extra commit in the development clone is the stash's
working-tree commit. Today's branches and tags add 31 commits beyond
`origin/devel`. No commit contains a `.gitattributes` file or binary content, so
`--text` and `--no-textconv` do not change what this history exposes.

**Outcome:** no findings and no scanner errors, so there is nothing to classify,
rotate or revoke, and no exception or baseline was created. A clean result covers
the default rules of Gitleaks `8.30.1` only. It does not prove that the history
never contained credentials in formats those rules do not recognize.

The hosted `workflow_dispatch` run remains pending (7.8). It scans the refs that
the hosted checkout fetches.

If a hosted or later scan reports findings:

1. Reproduce locally with the same binary, configuration and range. Review the
   details only there, never in issues, PRs or artifacts.
2. Classify each finding (credential, test fixture, false positive) without
   publishing values, paths or lines.
3. Rotate or revoke any credential that is or may still be valid. Rotation ends a
   credential's validity but does not remove it from Git history. Removal
   requires a coordinated history rewrite, which is a separate decision.
4. Do not add allowlists, baselines or ignore files just to obtain a passing run.
   Any exception must be specific, justified and reviewed in a PR.

### 7.6. Local execution

`--remerge-diff` requires Git 2.36 or later. Run from a checkout without a root
`.gitleaksignore`: the job rejects one, and Gitleaks would apply it.

```bash
GL=$(mktemp -d)
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
  --output "$GL/gitleaks.tar.gz"
printf '%s  %s\n' 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb \
  "$GL/gitleaks.tar.gz" | sha256sum --check --strict
tar -xzf "$GL/gitleaks.tar.gz" -C "$GL" gitleaks
: > "$GL/gitleaks.ignore"
"$GL/gitleaks" git . --config .gitleaks.toml \
  --log-opts="--text --no-textconv --remerge-diff --all" \
  --gitleaks-ignore-path "$GL/gitleaks.ignore" --ignore-gitleaks-allow \
  --redact=100 --report-format json --report-path "$GL/gitleaks.json" \
  --timeout 300 --log-level error --no-banner
```

Replace `--all` with `<base>..HEAD` to scan a branch. Any output from this command
means the scan did not complete normally, even with exit code 0. Use `--verbose`
only in a private terminal: even redacted output shows paths and lines. To
classify the report as CI does, run `GITLEAKS_EXIT_CODE=<code>
GITLEAKS_LOG_LINES=<output lines> GITLEAKS_REPORT_PATH="$GL/gitleaks.json"
GITLEAKS_METADATA_PATH="$GL/metadata.json" node scripts/gitleaks-report.cjs`.
Remove `$GL` afterwards. `npm run test:ci-tools` runs the collector tests.

### 7.7. Local verification

Verified on 2026-11-04 with Node `22.20.0`, Git `2.53.0` and the existing
`node_modules`. npm was the bundled `10.9.3`, not the pinned `11.21.1`. No
installation was run.

| Check | Result |
| --- | --- |
| The workflow's install script: download, SHA-256 and version check | Passed |
| Same script with a wrong checksum, with version `8.30.0` against the pinned checksum, and with nonexistent version `8.99.99` | Failed before extraction: checksum mismatch (exit 1), checksum mismatch (exit 1), HTTP 404 (exit 22) |
| `scripts/gitleaks-report.test.cjs` | 9 passed; `test:ci-tools` 74 passed |
| The same tests against FWCloud API's unmodified collector | 6 failed: field set without `scannerLogLines`, missing report counted as 0, parser message copied, crash on `[null]`, scanner output ignored, no metadata on checkout mismatch |
| Job harness: scope, scan, verification and cleanup scripts read from `nodejs.yml` and run with `bash -e` against synthetic repositories | 37 job scenarios and the aggregate check passed (below) |
| Gitleaks probes | Exit 0, empty report and two `ERR` lines after a missing object, an invalid revision or an unknown Git option; exit 1 and one `ERR` line after `--timeout`; no output from complete scans, with or without a remote |
| Default rule ids in the 8.30.1 binary | 222, all matching the rule-id pattern |
| Incremental scan of this change as one temporary commit on `afc1cd7` | 0 findings, no output |
| `lint:check`, `format:check` and `git diff --check` | Passed |
| Actionlint | Not run: downloading it was not permitted in this environment |

The harness generated a synthetic `ghp_` token per run; no real credential was
used. A control repeats a scenario without one protection to show that the
protection is needed.

| Scenario | Result |
| --- | --- |
| PR: secret added, then deleted in the next commit | `findings` (`github-pat`); job failed |
| Clean PR; PR whose base gained a secret after the branch point | `success`; range starts at the merge base |
| Push `before..after` including the secret commit / starting after it | `findings` / `success` |
| New branch (`before` all zeros) | Reachable history scanned: `findings`; a secret only on another branch was not reached |
| `workflow_dispatch` | `--all` reached the secret on the other branch: `findings` |
| Unavailable or empty `before`/base, unsupported event, checkout differing from `ANALYSIS_COMMIT`, unrelated histories, shallow clone (`--all` and new branch) | Scope step failed; no scan. Shallow control without the check: exit 0, no findings |
| Root `.gitleaksignore` with the finding's fingerprint; dangling `.gitleaksignore` symlink | Scan step failed; `error`. Control with the empty ignore file but without the check: exit 0, no findings |
| Inline `gitleaks:allow` | `findings`. Control without `--ignore-gitleaks-allow`: no findings |
| `.gitattributes` `*.ts -diff` and `* binary` (root) and `* -diff` (`src/`), each in the secret's commit and in a later commit | `findings` in all six. Controls without `--text`: exit 0, no findings |
| `diff=<driver>` with a configured textconv command | `findings`. Control with `--text` only: no findings |
| File starting with a NUL byte | `findings`. Control without `--text`: no findings |
| 64 KiB of random binary content | `success`, no scanner output |
| Secret added only in a clean merge; secret added while resolving a conflict; conflicted merge with a clean resolution | `findings`, `findings`, `success`. Controls without `--remerge-diff`: no findings |
| PR merging a base branch whose history contains a secret | `success`: not rescanned. `--diff-merges=first-parent` reported it |
| Missing Git object in the scanned history | `error` from the scanner output. Control on exit code and report alone: exit 0, no findings |
| Invalid `.gitleaks.toml` | Scanner error; `error` |
| Committed `reports/secrets/` files claiming success, with the scan running / with the `.gitleaksignore` check failing | Removed first; `findings` / `error` |
| `updater-ci` with each need `success`/`failure`/`skipped`/`cancelled` | Of 64 combinations, only all-`success` passed |

In every scenario the step logs, summary and metadata excluded the token, file
path and line content. `reports/secrets/` contained only `metadata.json` after
cleanup, no `gitleaks.*` file remained in the runner temporary directory, and
`success` and `findings` scans recorded `scannerLogLines: 0`.

### 7.8. Hosted acceptance pending

The successful `ENS` push, sanitized archive and effective security-artifact
expiry were reviewed on 2026-11-04 (section 10). The PR job also passed in run
`41819337417`. These observations do not close the failure/full-history items.

- [ ] Run the workflow on a PR to `ENS`. Confirm `FWCloud-Updater Secrets` and
  `updater-ci` succeed, the summary shows `pull-request:<merge-base>..<head>`
  and the scan step prints nothing.
- [ ] In a throwaway PR, add a synthetic token in one commit and delete it in the
  next. Confirm `secrets` and `updater-ci` fail.
- [ ] Download `updater-secrets-<RUN_ID>-<ATTEMPT>` from a clean and a failing run.
  Confirm it contains only `metadata.json` and has 90-day retention, and that
  logs, summaries and artifacts show no values, paths or lines.
- [x] Verify a push to `ENS` scans `<before>..<sha>`.
- [ ] Run `workflow_dispatch` once the workflow is on the default branch
  (`origin/main` has no `workflow_dispatch` trigger today). Record the run, the
  analyzed commit, the commit and finding counts and, for any finding, its
  classification and remediation as described in 7.5.
- [ ] Record the reviewer and date.

## 8. Phase 5 — Dependency SCA and SBOM with Trivy

### 8.1. Scope and execution

The dedicated `sca` job (`FWCloud-Updater SCA and SBOM`) follows Phase 4 of
FWCloud API on `ENS`. It has a 30-minute timeout and checks out
`ANALYSIS_COMMIT` explicitly, with checkout credentials persistence disabled.
It uses Node's built-in modules for validation, without `npm ci`, npm dependency
installation or project lifecycle scripts. The scan includes runtime and
development dependencies, including direct, transitive and optional npm packages
represented in the root `package-lock.json`.

This is an inventory of the repository lockfile at the analyzed revision. It
does not assess operating system packages on deployment targets, packages added
by external installers, the complete installation or upgrade procedure, or
distribution artifacts built outside this workflow. It does not establish the
security of the complete deployed system. License information available from the
lockfile is not a complete license audit without installed package contents.
See Trivy's [npm coverage documentation](https://www.trivy.dev/docs/latest/guide/coverage/language/nodejs/).

### 8.2. Configuration and binary integrity

[`scripts/trivy-config.json`](../scripts/trivy-config.json) is copied from the
API and defines:

| Setting | Value |
| --- | --- |
| Trivy version | `0.74.0` |
| Official Linux x64 archive | `trivy_0.74.0_Linux-64bit.tar.gz` |
| Archive SHA-256 | `2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a` |
| Blocking severities | `HIGH`, `CRITICAL` |
| Native findings exit code | `5` |
| CycloneDX version | `1.7` |

The workflow downloads the archive from the official
[Aqua Security release](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0),
checks its SHA-256 before extraction and verifies the installed version. An
unexpected version fails both installation and report validation. The cache is
isolated under the runner's temporary directory; project dependencies are not
installed to populate it.

All Trivy commands use these restrictions:

```bash
export TRIVY_CONFIG=/dev/null
export TRIVY_IGNOREFILE=/dev/null
export TRIVY_TIMEOUT=10m
export TRIVY_DISABLE_TELEMETRY=true
export TRIVY_SKIP_VERSION_CHECK=true
```

These disable implicit repository configuration and ignore files, telemetry and
version checks. They do not disable vulnerability database updates. No exception
or repository-controlled suppression is currently enabled.

For local verification, download and verify the binary in a temporary directory:

```bash
TRIVY_VERSION=$(node -p 'require("./scripts/trivy-config.json").version')
TRIVY_ARCHIVE=$(node -p 'require("./scripts/trivy-config.json").archive')
TRIVY_ARCHIVE_SHA256=$(node -p 'require("./scripts/trivy-config.json").archiveSha256')
TRIVY_WORKDIR=$(mktemp -d)
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${TRIVY_ARCHIVE}" \
  --output "$TRIVY_WORKDIR/$TRIVY_ARCHIVE"
printf '%s  %s\n' "$TRIVY_ARCHIVE_SHA256" "$TRIVY_WORKDIR/$TRIVY_ARCHIVE" \
  | sha256sum --check --strict
tar -xzf "$TRIVY_WORKDIR/$TRIVY_ARCHIVE" -C "$TRIVY_WORKDIR" trivy
export TRIVY_BINARY="$TRIVY_WORKDIR/trivy"
export TRIVY_CACHE_DIR="$TRIVY_WORKDIR/cache"
"$TRIVY_BINARY" --version
node --test scripts/trivy-policy.test.cjs
```

Use a clean checkout without `node_modules` for the same inventory scope as CI.
The complete failure handling and evidence collection commands are in the
[workflow](workflows/nodejs.yml); the following commands show each scanner
operation independently.

### 8.3. Reports and blocking policy

The workflow removes old dependency evidence before starting. It generates the
complete vulnerability report once, including every severity and vulnerabilities
without an available fix:

```bash
mkdir -p reports/dependencies
"$TRIVY_BINARY" fs . \
  --scanners vuln --pkg-types library \
  --include-dev-deps --list-all-pkgs --no-progress \
  --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
  --ignore-unfixed=false --exit-code 0 \
  --format json --output reports/dependencies/trivy.json
```

Report generation uses exit code `0` for findings so that the full JSON survives
for the separate gate. Scanner execution failures still return nonzero codes.
The workflow captures the scanner's native code before `tee` can replace it, and
also fails if saving the log fails.

An independent scan generates the dependency SBOM. CycloneDX output does not
enable vulnerability scanning by default; vulnerability evidence remains in the
separate JSON report.

```bash
"$TRIVY_BINARY" fs . \
  --include-dev-deps --no-progress \
  --format cyclonedx --output reports/dependencies/sbom.cdx.json
"$TRIVY_BINARY" version --format json > reports/dependencies/trivy-version.json
```

The native severity gate converts the existing vulnerability report, without
rescanning dependencies or updating findings:

```bash
"$TRIVY_BINARY" convert \
  --format table --scanners vuln --severity HIGH,CRITICAL --exit-code 5 \
  reports/dependencies/trivy.json > reports/dependencies/blocking.txt 2>&1
```

| Condition | Result |
| --- | --- |
| `HIGH` or `CRITICAL`, with or without a fix | Native gate exits `5`; CI fails |
| Only `UNKNOWN`, `LOW` or `MEDIUM` | Reported; native gate exits `0` |
| Any other nonzero gate exit code | Operational error; CI fails |
| Missing or invalid lockfile, empty runtime/development inventory | CI fails |
| Missing, malformed or inconsistent reports or version/database metadata | CI fails |
| Failed/skipped scan, SBOM generation, native policy test or validation | CI fails |

The gate is not run with `--ignore-unfixed`. The initial scan explicitly sets
`--ignore-unfixed=false`, so findings without a fix remain eligible for blocking.
A clean `npm audit` result does not establish a clean Trivy result: the tools use
different vulnerability data sources and may group findings differently.

### 8.4. Validation and artifacts

[`scripts/trivy-report.cjs`](../scripts/trivy-report.cjs) adapts the API collector
and writes `metadata.json` with one of three statuses:

- `success`: complete, valid evidence with no blocking findings.
- `findings`: complete, valid evidence with blocking findings.
- `error`: missing, malformed or inconsistent evidence, or an operational error.

Both `findings` and `error` fail validation. Metadata records the actual analyzed
commit, Trivy/database versions and timestamps, root lockfile SHA-256, package
and component counts, dependency scopes/relationships, vulnerability counts by
severity and native scan/SBOM/policy exit codes. The collector verifies the
checkout against `ANALYSIS_COMMIT`, requires the root lockfile inventory, checks
runtime and development coverage, validates CycloneDX 1.7 and dependency
references, and compares the SBOM npm package identities with the scan inventory.
It parses lockfile formats 2 and 3 and compares their unique dependency identities
with the root scan inventory, so two equally truncated reports cannot pass.
The report's scanner version must match the configured version, and database
metadata must include a positive integer schema version and valid update/next
update timestamps. It also cross-checks the native gate result against the
reported HIGH/CRITICAL counts. Detailed findings are excluded from metadata and
Actions summaries.

Evidence collection and upload use `if: always()`. The gate retains its native
failure after collecting context and metadata; uploading evidence cannot turn a
failed scan into a passing job. When the scanner cannot produce reports, the
artifact contains the available partial evidence and the job still fails. Missing
files are not fabricated into successful reports.

The artifact is named `updater-sca-sbom-<RUN_ID>-<ATTEMPT>`, with 90 days of requested
retention, and contains these files under `reports/dependencies/` when available:

| File | Format and purpose |
| --- | --- |
| `trivy.json` | Full Trivy JSON vulnerability and npm package inventory |
| `sbom.cdx.json` | Independent CycloneDX 1.7 JSON dependency inventory |
| `trivy-version.json` | Trivy version and vulnerability database metadata |
| `blocking.txt` | Native HIGH/CRITICAL table, or gate execution diagnostics |
| `context.txt` | Revision, run/attempt, step outcomes and native exit codes |
| `scan.log` | Vulnerability scanner execution diagnostics |
| `sbom.log` | SBOM generation diagnostics |
| `metadata.json` | Validated aggregate results and evidence errors |

The detailed report and gate table contain dependency security findings and are
available for artifact review. Actions summaries contain aggregates and execution
context only. `updater-ci` now depends on `quality`, `test`, `secrets` and `sca`,
and requires each result to equal `success`. A failed, cancelled, skipped or
incomplete SCA job cannot produce a successful aggregate.

### 8.5. Initial scan and remediation review

The first complete local verification on 2026-11-04 analyzed revision
`ff79444023e0ec8db5ea102cdabdeba299089820` in a temporary copy of tracked files,
without `node_modules` or dependency installation. The cached official archive
was checked against the configured SHA-256 before a fresh extraction. Trivy
reported version `0.74.0`; vulnerability database schema version `2` had
`UpdatedAt: 2026-11-04T07:16:25.226375897Z` and
`NextUpdate: 2026-11-05T07:16:25.22637534Z`.

Root lockfile SHA-256:
`00267dd982bf452bed6005e4c99988f20a2bfa69330dfdf4eaca50760d892013`.

| Initial result | Count |
| --- | ---: |
| Unique npm packages | 657 |
| Runtime / development packages | 162 / 495 |
| Direct / indirect packages | 30 / 627 |
| SBOM components / npm components | 658 / 657 |
| SBOM dependency entries | 659 |
| `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `UNKNOWN` | 0 / 0 / 0 / 0 / 0 |
| Native scan / SBOM / gate exit codes | 0 / 0 / 0 |

The complete vulnerability report was reviewed: there were no findings to
remediate, defer or except. Dependency versions and overrides remain unchanged.
No vulnerability exception was proposed. These results apply to this lockfile
and database snapshot; future database updates can produce new findings even
without dependency changes. The previously reported clean npm audit result was
not used as Trivy acceptance evidence.

### 8.6. Vulnerability exceptions

No automatic exception mechanism is enabled. Adding `.trivyignore` or
`trivy.yaml` does not change the CI policy because both inputs are disabled.
A blocking finding must be remediated or remain blocking until an explicit
exception is approved and its enforcement is implemented and tested.

For each proposed exception, include a reviewable record in the change that
requests it with:

- The specific advisory/CVE identifier, package, affected version, dependency
  scope/path, severity and reference to the scan artifact and analyzed commit.
- A technical justification, applicability/exposure assessment, reason immediate
  remediation is unavailable and any compensating controls.
- A named responsible person, remediation or follow-up action, and an explicit
  expiration date.
- The explicit review decision, reviewer and approval date; proposals alone do
  not authorize suppression.

Any approved implementation must match only the reviewed finding, preserve the
complete report and inventory, record the exception in evidence, and fail after
expiration. Its tests must show that unrelated HIGH/CRITICAL findings, unfixed
findings and scanner errors remain blocking. Removing or weakening the global
severity gate, silently enabling ignore files, or treating scanner failures as
accepted vulnerabilities is not an exception procedure. Review outstanding
exceptions before expiration; remediate or obtain a new explicit review rather
than silently extending them.

### 8.7. Verification and hosted acceptance

`npm run test:ci-tools` discovers the report-validator and native-policy tests
through `scripts/*.test.cjs`. The native test is skipped when `TRIVY_BINARY` is
absent in the quality job; `sca` sets it to the verified binary and runs that
test explicitly before scanning. It exercises all severity levels, preserves
unfixed HIGH/CRITICAL findings, checks their presence in `blocking.txt`, confirms
conversion leaves the source report unchanged, and rejects malformed input.

Local checks and controlled workflow-step results are recorded here separately
from hosted acceptance. A synthetic blocking finding is test evidence, not an
additional vulnerability in the project's initial scan.

Verified on 2026-11-04, using Node `22.20.0` and the verified Trivy `0.74.0` binary:

| Check | Result |
| --- | --- |
| `npm run test:ci-tools` with `TRIVY_BINARY` configured | 98 passed, none skipped; includes 23 report-validator tests and the native policy test |
| Complete scan, independent SBOM, native gate and updated collector in a checkout without `node_modules` | Passed; all eight evidence files produced; initial scan counts reproduced |
| Controlled real scan of a separate lockfile with `lodash@4.17.20` and development dependency `typescript@5.0.4` | Native gate exited `5`, metadata `findings`; two HIGH and two MEDIUM findings retained in the full report |
| Exact workflow gate body with synthetic unfixed HIGH/CRITICAL findings | Exit `5`, metadata `findings`; finding retained in `blocking.txt`, absent from the Actions summary |
| Exact workflow gate body with clean/LOW/MEDIUM reports | Exit `0`, metadata `success` |
| Scanner/SBOM errors; missing, malformed or inconsistent evidence; unexpected version; skipped installation | Nonzero gate step and error metadata |
| Scan, SBOM and gate log write failures | Nonzero step; `tee` cannot hide failure or replace the captured native exit code |
| Aggregate shell step | All 256 success/failure/skipped/cancelled combinations checked; only four successful results accepted |
| `npm run lint:ci` / `npm run format:ci` | Passed |
| Actionlint `1.7.7`, all 25 workflow shell bodies and `git diff --check` | Passed; unavailable ShellCheck disabled in Actionlint |

The controlled real scan detected `CVE-2021-23337` and `CVE-2026-4800` as HIGH
findings in the deliberately vulnerable lodash fixture. Both identifiers appeared
in `blocking.txt`; their reported fixes were `4.17.21` and `4.18.0`, respectively.
This fixture changed only a temporary lockfile, without installation or changes
to the project's dependencies. Synthetic unfixed findings cover the additional
case where no fix is available. Local full-scan evidence is retained under the
ignored `reports/dependencies/` directory for review; it is not a hosted artifact.

The sandbox initially rejected Node subprocess calls to Git with `EPERM`; the
tests and workflow verification passed when rerun outside that restriction.
These are local checks of the commands and failure behavior, not a claim that
the GitHub artifact service or branch protection has been exercised.

Successful hosted scan/SBOM evidence is recorded in section 10: run
`41826696674` passed and all eight archive files were reviewed. Remaining
hosted acceptance:

- Inspect the rendered Actions summary and confirm repository/organization
  retention settings; the reviewed artifact expiry is approximately 90 days.
- Confirm artifact upload after a controlled HIGH finding and after scanner/SBOM
  errors. Record the native failure and retained diagnostics.
- Confirm branch protection requires `updater-ci`, and an unsuccessful or skipped
  SCA result cannot pass that required check.

## 9. SonarQube Cloud (API Phase 7)

### 9.1. Scope and implementation

This phase follows FWCloud API Phase 7 using Updater's Node-only Jest evidence,
without the API's database-matrix requirements. The analysis job consumes the
existing Phase 2 Node 22 artifact; it does not install dependencies, build or
repeat Jest. Administrative setup and local usage are documented in
[docs/SONARQUBE.md](../docs/SONARQUBE.md).

`sonar-project.properties` configures the proposed organization/project
`soltecsis` / `soltecsis_fwcloud-updater`, Cloud EU, sources `src,config`, colocated
`src/**/*.spec.ts` tests, `reports/coverage/lcov.info` and blocking Quality Gate
waiting with a 300-second timeout. Production analysis excludes specifications,
declarations and generated content. `test/` fixtures are outside the analysis
roots. The dedicated `tsconfig.sonar.json` avoids production TypeScript 6 compiler
options while retaining application module, target, decorator and alias settings;
it does not alter the production build. Hosted analyzer precision, including
external types without installed dependencies, remains an acceptance check.

`sonar` is named `FWCloud-Updater SonarQube`, has a 20-minute timeout and depends
on `quality`, `test`, `secrets` and `sca`. It checks out the same
`ANALYSIS_COMMIT` with full history and without persisted credentials, downloads
`updater-coverage-node22-<RUN_ID>` from that execution and validates it before
scanning. The official action is pinned to
`SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9`
(v8.3.0), with CLI `8.1.0.6389` and signature verification enabled. Only the
scanner step receives `SONAR_TOKEN`. No project dependencies are installed there.

### 9.2. Evidence and failure policy

`scripts/sonar-analysis.cjs` validates the actual Phase 2 schema: Jest test
counters and success, Node `22.x`, successful test-step outcome, coverage metrics,
`errors: []`, and `lcov.path` / `lcov.sha256`. It checks repository, checkout SHA,
event, run ID and producer/consumer attempts. Coverage may come from an earlier
attempt of the same run and revision, but never a later attempt or another run.
The summary must agree with the producer metadata and LCOV records. Absolute or
traversing paths, generated content, missing original sources and symlinks in
`src/` or `config/` are rejected. Scanner configuration is validated before use.

The stable coverage artifact name and existing `overwrite: true` producer policy
allow partial reruns. Rerunning only Sonar reuses the available valid producer
attempt. Rerunning Node 22 replaces the artifact for that execution. Sonar metadata
records both attempts; a changed commit requires a new execution.

`updater-sonarqube-<RUN_ID>-<ATTEMPT>` contains only
`reports/sonar/metadata.json`, with 90 days of requested retention. It records
revision/run context, coverage producer, checksums, configuration and scanner
identity, validation/download/scan outcomes and the aggregate gate result. Evidence
collection and upload run after failures when checkout context is available,
including download/preparation failures. No scanner credentials, raw scanner
logs, sources or `.scannerwork` are uploaded. Scanner failure remains blocking.

`updater-ci.needs` includes `sonar`. Eligible pushes, internal PRs and manual runs
require `sonar == success`; fork PRs and Dependabot actors/authors require
`sonar == skipped`. The aggregate records the explicit skip reason in its Actions
summary before enforcing every other upstream job. Quality, all tests, Gitleaks
and Trivy remain required for excluded events. A missing token is an eligible
execution failure. A push after merging an external PR into `ENS` analyzes the
resulting commit, unless the actor is Dependabot.

### 9.3. Local validation and hosted acceptance

Local validation results are recorded separately from administrative and hosted
acceptance. The local coverage experiment uses the current checkout and simulated
run identifiers; it does not claim that Actions or SonarQube Cloud executed.

Verified locally on 2026-11-04 with Node `22.20.0`:

| Check | Result |
| --- | --- |
| `npm run test:ci-tools` | 251 passed, zero failures, one native Trivy test skipped because `TRIVY_BINARY` was unset; includes 150 Sonar helper tests and four workflow tests |
| `npm run test:coverage:ci -- --runInBand` | Six suites and 61 tests passed; Jest line coverage 78.35% (152/194) |
| Existing `ci:reports` collector on that Jest output | Passed; successful Node 22 metadata and exact LCOV checksum produced |
| Real Jest artifact consumed by `prepare()` | Accepted all 12 original source records, including `config/`; producer attempt 1 reused for analysis attempt 2 |
| Actual aggregate shell | All 2,048 required/excluded result combinations checked; other checks remain mandatory and skip summaries are retained after failures |
| Actual token preflight shell | Missing, empty or false token-presence flag fails before preparation; true invokes the expected helper and coverage path |
| `npm run lint:check` / `npm run format:check` | Passed, including new helpers and tests |
| Analysis TSConfig with TypeScript `6.0.2` | No-emission check passed with CLI-only `--ignoreDeprecations 6.0`; explicit scope has 12 production files, five specifications and zero `test/` fixtures |
| Actionlint `1.7.7`, JSON formatting and `git diff --check` | Passed; unavailable ShellCheck disabled in Actionlint |

The coverage producer used the current checked-out revision
`e6fb9729adffbf0d669440ed46b7aa8aa116f4fe`, with simulated run `123`, producer
attempt `1` and analysis attempt `2`. Its LCOV SHA-256 was
`1da528ae8ffa8ee8fe39f0f6f9dfc995aa089f560a9abb22f90552be46c7510f`.
The integration changes were uncommitted during this local experiment. The
scanner was not invoked against SonarQube Cloud. Failure/gate tests use controlled
step outcomes to validate evidence and aggregation; they do not establish the
remote Quality Gate's actual conditions or result.

The sandbox initially denied HTTP test listeners and Git/npm subprocess calls
with `EPERM`; coverage, report collection and tooling tests passed when repeated
outside that restriction. No application or dependency changes were required.

The successful `ENS` execution, coverage import, source indexing, passing gate
and sanitized artifact have now been reviewed (section 10). Administrative and
negative-case acceptance remain pending:

- Verify the actual project key, repository binding and GitHub App access.
- Disable Automatic Analysis; confirm analysis permission for `SONAR_TOKEN` and
  repository access to the secret without exposing its value.
- Record the assigned Quality Gate, new-code definition and plan entitlement for
  `ENS` and internal PRs.
- Confirm the assigned Quality Gate identity and administrative new-code
  settings. Section 10 records the immutable analysis ID, evaluated conditions,
  scanner log and Sonar decoration for the reviewed successful execution.
- Exercise a passing/failing internal PR, failed gate, missing/invalid token and
  scanner error; confirm both `sonar` and `updater-ci` fail as required.
- Confirm fork/Dependabot skips with all other checks enforced and analysis of
  the push following an external merge.
- Rerun only Sonar and inspect reused coverage attempt, current analysis attempt,
  artifact contents, failure evidence and effective retention.
- Verify branch rules require `updater-ci` and enforce the result. Do not mark
  the integration complete until project, permissions and gate are verified.

## 10. Hosted evidence, protection and rollout

### 10.1. Implementation register

Verification date for **every row below**: **2026-11-04**. Reviewer for every row:
**Codex, automated repository/API/artifact/log review**. Maintainer ownership was
not supplied and remains pending designation; no maintainer approval is claimed.
All listed PRs were merged into `ENS`. Their PR executions and matching
post-merge executions report success; the PR job lists were also inspected.
This establishes deployment on `ENS`, rather than completion of acceptance.

The full commit in each row identifies the implemented PR head. The linked merge
commit identifies its deployment on `ENS`. Run links select attempt 1.

| Phase | PR | Implemented commit SHA | ENS merge | PR run / ENS push run | Validation and outstanding work |
| --- | --- | --- | --- | --- | --- |
| 1 — Foundation | [#104](https://github.com/soltecsis/fwcloud-updater/pull/104) | `f630222f19316587ac30a89b84fe9a12518a8114` | [`45f33a0`](https://github.com/soltecsis/fwcloud-updater/commit/45f33a0c9d31d4b52ee12fcd5d3608b9b6f1b45f) | [41804081675](https://github.com/soltecsis/fwcloud-updater/actions/runs/41804081675/attempts/1) / [41804207548](https://github.com/soltecsis/fwcloud-updater/actions/runs/41804207548/attempts/1) | Quality, matrix and aggregate passed; protection, event/cancellation acceptance open. |
| 1b — Quality scope | [#105](https://github.com/soltecsis/fwcloud-updater/pull/105) | `003b3f0a6ab2fd1fdc84c95d41cff84e24e61320` | [`8f8658b`](https://github.com/soltecsis/fwcloud-updater/commit/8f8658b683bd715b2be11d18b8c3d7e88635e286) | [41805470259](https://github.com/soltecsis/fwcloud-updater/actions/runs/41805470259/attempts/1) / [41805612083](https://github.com/soltecsis/fwcloud-updater/actions/runs/41805612083/attempts/1) | Extended lint/format passed; final protected rollout open. |
| 2 — Reports and reference | [#106](https://github.com/soltecsis/fwcloud-updater/pull/106) | `b902b68b19209c1ac0d516d77763b838d04c1850` | [`d3e1c5e`](https://github.com/soltecsis/fwcloud-updater/commit/d3e1c5e7e2fcc26152f75c024ccbc0c7c140354b) | [41808866398](https://github.com/soltecsis/fwcloud-updater/actions/runs/41808866398/attempts/1) / [41809108076](https://github.com/soltecsis/fwcloud-updater/actions/runs/41809108076/attempts/1) | Current reports/coverage reviewed; failed uploads, partial rerun, summaries and new retention open. |
| 3 — Hermetic/auth/HTTP tests | [#107](https://github.com/soltecsis/fwcloud-updater/pull/107) | `7884c17df43ca74a5abb35ad45097a5ae084abc2` | [`afc1cd7`](https://github.com/soltecsis/fwcloud-updater/commit/afc1cd7ef73a6962d23a2ad32bc958f99bb6f9ba) | [41813191217](https://github.com/soltecsis/fwcloud-updater/actions/runs/41813191217/attempts/1) / [41813419845](https://github.com/soltecsis/fwcloud-updater/actions/runs/41813419845/attempts/1) | 61 tests per Node cell; current coverage equals Phase 3 reference; final protected rollout open. |
| 4 — Gitleaks | [#108](https://github.com/soltecsis/fwcloud-updater/pull/108) | `2a4a696f2611f04103da0097989bf261e23d8ae4` | [`d40ab2d`](https://github.com/soltecsis/fwcloud-updater/commit/d40ab2dba410784fc4a9f39b149ad69904a23be5) | [41819337417](https://github.com/soltecsis/fwcloud-updater/actions/runs/41819337417/attempts/1) / [41819438914](https://github.com/soltecsis/fwcloud-updater/actions/runs/41819438914/attempts/1) | Push range and sanitized clean artifact reviewed; hosted findings/errors and full-history dispatch open. |
| 5 — Trivy/SBOM | [#109](https://github.com/soltecsis/fwcloud-updater/pull/109) | `73a221b613203b1961546431653460ac7d195213` | [`e6fb972`](https://github.com/soltecsis/fwcloud-updater/commit/e6fb9729adffbf0d669440ed46b7aa8aa116f4fe) | [41823964028](https://github.com/soltecsis/fwcloud-updater/actions/runs/41823964028/attempts/1) / [41824128025](https://github.com/soltecsis/fwcloud-updater/actions/runs/41824128025/attempts/1) | 657 npm packages, zero findings, matching SBOM reviewed; hosted finding/scanner/SBOM failure cases open. |
| 6 — SonarQube | [#110](https://github.com/soltecsis/fwcloud-updater/pull/110) | `9be0677704205039ac8e69b456ad82b185d6ed03` | [`04e39b3`](https://github.com/soltecsis/fwcloud-updater/commit/04e39b3adf742f259611d017891e3f28903d2899) | [41826344334](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826344334/attempts/1) / [41826696674](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/attempts/1) | Coverage import, immutable analysis reference and passing gate verified; administrative configuration and negative cases open. |
| 7 — Protection, evidence and rollout | Pending publication | `ba316f2357804414cfa9c2346e4434bc870c9453` (retention); evidence documentation in this commit | Not deployed | No run for these final changes | README/evidence register and test/coverage retention requests changed locally; protection, hosted negative cases and rollout remain open. |

Artifact relevance: phases 1 and 1b use the quality/matrix logs and aggregate
check; phases 2 and 3 use all test artifacts and Node 22 coverage; phase 4 uses
the secrets artifact; phase 5 uses SCA/SBOM; phase 6 uses Sonar metadata together
with Node 22 coverage and scanner logs. The detailed review below samples the
latest integrated revision, including all those implementations, rather than
claiming that earlier PR artifacts were downloaded.

### 10.2. Reviewed artifacts

Representative execution:
[41826696674, attempt 1](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/attempts/1),
`push` to `ENS`, created `2026-11-04T12:08:27Z`, completed successfully at
`2026-11-04T12:10:09Z`. Expected repository:
`soltecsis/fwcloud-updater` (repository ID `314585608`); expected commit:
`04e39b3adf742f259611d017891e3f28903d2899`.

All seven archives were downloaded, their SHA-256 values independently matched
GitHub's artifact digests, and their contents were extracted and inspected.
GitHub artifact provenance and embedded metadata agree on repository, SHA,
event, ref, run and attempt. No expired archive was used. Recorded expiry is the
effective value returned by GitHub, not a value inferred from YAML.

| Artifact | Artifact ID | Archive SHA-256 | GitHub expiry (UTC) |
| --- | --- | --- | --- |
| [`updater-coverage-node22-41826696674`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13319128301) | `13319128301` | `83502091dcc97a2f40ae919dd2b720c61bd0a91414cc82112f76da5bc3c9f18b` | `2026-11-18T12:08:54Z` |
| [`updater-sca-sbom-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13319885980) | `13319885980` | `438db6a2bc5535a0691dd139daea03676f59a1950aab7521506da3294433ed04` | `2027-02-02T12:08:28Z` |
| [`updater-secrets-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13319093233) | `13319093233` | `a8e700101eb4b2504daa69722464339c3e22d714df7c8337417ed9e12ab5417b` | `2027-02-02T12:08:28Z` |
| [`updater-sonarqube-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13319258406) | `13319258406` | `ade85a403e290d59e35dc9889f84551f5430b5dd317b115a5b9b6e2528a4c2ce` | `2027-02-02T12:08:28Z` |
| [`updater-tests-node20-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13318134707) | `13318134707` | `30784b20ac524f6c0c273a29c9dafea907a7d462cf846a778f65ac146ddfeb64` | `2026-11-18T12:09:03Z` |
| [`updater-tests-node22-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13318854059) | `13318854059` | `09dd72a6e008ad9a8afd5a75bb7bc965399ba63697de630ed80755bad57383ed` | `2026-11-18T12:08:53Z` |
| [`updater-tests-node24-41826696674-1`](https://github.com/soltecsis/fwcloud-updater/actions/runs/41826696674/artifacts/13319936022) | `13319936022` | `612e4b738ebd68c269d6fe0fc924a8ca9c0516725d037adc4901eb819212900a` | `2026-11-18T12:08:57Z` |

| Control | Content and validation result |
| --- | --- |
| Jest, Node 20/22/24 | Each archive contains `tests/junit.xml`, `tests/results.json` and `metadata.json`. XML, JSON and metadata agree: six suites, 61 passed, zero failed/skipped/todo per cell. Effective Node versions are `20.20.2`, `22.23.4`, `24.22.1`; npm is `11.21.1`. |
| Node 22 coverage | `analysis.json`, `lcov.info`, `coverage-summary.json`, readable HTML and referenced assets present. Twelve original source records under `src/` and `config/`; no specification/declaration/generated sources. Producer metadata equals the Node 22 test metadata. |
| Gitleaks | Archive contains only `metadata.json`, with version `8.30.1`, status `success`, zero findings/errors/log lines and no finding-level content. Scope is `push:e6fb9729adffbf0d669440ed46b7aa8aa116f4fe..04e39b3adf742f259611d017891e3f28903d2899`; the job log corroborates successful execution and cleanup. |
| Trivy/SBOM | All eight documented files parse/read correctly. Trivy `0.74.0`, database schema 2 updated `2026-11-04T07:16:25.226375897Z`; native scan/SBOM/policy exit codes 0. CycloneDX `1.7` has 658 components, including 657 npm packages; package identities match Trivy and the committed lockfile. 162 runtime/495 development packages, 30 direct/627 indirect; dependency references resolve. Zero reported vulnerabilities at every severity; no exceptions. |
| SonarQube | Archive contains only `metadata.json`. Coverage download/validation/scan succeeded, project `soltecsis_fwcloud-updater`, branch `ENS`, scanner `8.1.0.6389`. Configuration checksums match committed files. Producer and consumer are both attempt 1; imported LCOV checksum matches the producer bytes. Scanner log and Sonar check decoration independently confirm the passing gate. |

Committed lockfile SHA-256, matched against the SCA metadata:
`00267dd982bf452bed6005e4c99988f20a2bfa69330dfdf4eaca50760d892013`.

Node 22 LCOV SHA-256, independently calculated and identical in coverage and
Sonar metadata:
`d0844ee9dc63a91229ddf292a7aa2a88463aef175db0aed19a838af63dc1feae`.

| Metric | Reviewed ENS execution | Reference comparison |
| --- | --- | --- |
| Lines | 153/194, 78.86% | Exact Phase 3 reference |
| Statements | 175/217, 80.64% | Exact Phase 3 reference |
| Functions | 23/33, 69.69% | Exact Phase 3 reference |
| Branches | 71/80, 88.75% | Exact Phase 3 reference |

The initial Phase 2 line baseline remains 82/194 (42.26%); its separate local
measurement and checksum are preserved in section 5.4. The hosted result
matches the later Phase 3 reference byte for byte. Compare environments as
described in section 6.6; do not replace a historical baseline with a new result.

### 10.3. Job logs, Sonar and exposure review

All eight job logs from the representative execution were downloaded and reviewed:
quality, three test cells, secrets, SCA/SBOM, Sonar and `updater-ci`. All jobs and
their applicable upload steps succeeded. The quality job ran extended ESLint,
Prettier and the CI tooling suite (251 passed, zero failed, one native Trivy
test skipped there; native Trivy policy runs separately in SCA).

Seventy-six artifact text files, all job logs and nine check outputs were
reviewed using credential-signature checks and contextual review of authentication,
token, authorization, cookie/session, password and URL parameters. No unmasked
credentials or session values were observed. GitHub checkout credentials and
`SONAR_TOKEN` appear as masked placeholders. Other matches were public provenance,
test names, source identifiers or scanner/package labels. No raw Gitleaks report,
scanner work directory or credential configuration was published in the sampled
archives. Coverage HTML intentionally contains application source.

The Sonar scanner log records signature verification, revision `04e39b3...`,
LCOV import from `reports/coverage/lcov.info`, 18 indexed files and analysis of
all 17 TypeScript files using `tsconfig.sonar.json` (analyzer TypeScript
`6.0.3`). No unresolved LCOV-path warning was observed. The log reports
`QUALITY GATE STATUS: PASSED`. The
[Sonar check on this commit](https://github.com/soltecsis/fwcloud-updater/commit/04e39b3adf742f259611d017891e3f28903d2899/checks)
also says “Quality Gate passed”, with 96.3% **new-code** coverage; this is a
different metric from Jest's overall line coverage. The
[ENS Sonar dashboard](https://sonarcloud.io/dashboard?id=soltecsis_fwcloud-updater&branch=ENS)
is a mutable branch link. The downloaded metadata/logs omit an immutable server
analysis/task ID; a separate public API review on 2026-11-04 at 12:20 UTC obtained:

| Server evidence | Observed result |
| --- | --- |
| [Branch metadata](https://sonarcloud.io/api/project_branches/list?project=soltecsis_fwcloud-updater) | `ENS` commit is exactly `04e39b3adf742f259611d017891e3f28903d2899`, analysis date `2026-11-04T12:09:29Z`; type `SHORT`, merge branch `main` |
| [Current branch task](https://sonarcloud.io/api/ce/component?component=soltecsis_fwcloud-updater&branch=ENS) | Task `AaGmdz8Azjhvrde8Urhk`, `SUCCESS`, executed `2026-11-04T12:09:56Z`, zero warnings; analysis ID `ce000d45-c2f9-46f5-98b2-3a513b54f002` |
| [Gate for that immutable analysis ID](https://sonarcloud.io/api/qualitygates/project_status?analysisId=ce000d45-c2f9-46f5-98b2-3a513b54f002) | `OK`, all six conditions `OK`, `ignoredConditions: false` |

The observed gate conditions for this analysis are:

| New-code metric | Passing boundary | Actual |
| --- | --- | --- |
| Reliability, security and maintainability ratings (three conditions) | Each at most 1 | Each 1 |
| Coverage | At least 80% | 96.3% |
| Duplicated-line density | At most 3% | 0.0% |
| Security hotspots reviewed | 100% | 100.0% |

These public responses corroborate the reviewed candidate through the matching
branch SHA and execution times within the Actions run. They do not directly
identify GitHub run `41826696674`; that association is a correlation with the
reviewed workflow metadata/logs. The assigned-gate lookup returned 403 to the
anonymous API caller; the exact administrative gate identity and new-code
definition remain unverified. Branch type/merge target and evaluated thresholds
do not by themselves verify those administrative settings, repository binding,
Automatic Analysis, token ownership/permissions or negative cases.

Rendered `GITHUB_STEP_SUMMARY` pages could not be inspected through the
available connection: the eight Actions check outputs return null
`title/summary/text`, and the public page fetch did not return the run page.
Actual report text printed in logs and the Sonar decoration were reviewed.
Null check output does not prove that no rendered summary exists. A maintainer
must inspect the rendered successful and failing summaries and record the result.

Nonblocking hosted warnings: Actions targeting its deprecated Node 20 runtime
were forced to Node 24 (separate from the project's test matrix), npm reported
the existing `@parcel/watcher` `allowScripts` warning, and GPG noted missing
web-of-trust certification despite a good scanner signature. All checks passed.
This review covers the sampled successful execution; it neither establishes
absence of every possible secret encoding nor substitutes for failure-path review.

### 10.4. Effective protection and merge acceptance

Read-only GitHub checks on 2026-11-04 returned:

| Check | Observed result |
| --- | --- |
| Branch collection | `ENS`, `main` and `devel` each report `protected: false` |
| Repository/inherited rulesets | `GET /repos/soltecsis/fwcloud-updater/rulesets?includes_parents=true` returns `[]` |
| Detailed protection for `ENS` and `main` | Both reads return HTTP 403, `Resource not accessible by integration` |
| Connected app permissions | `admin: false`, `maintain: false`, `push: true`; no administration mutation tool |
| Local authentication fallback | Git credential helper supplies no usable authentication; no credentials printed |
| Required check producer | Check `126563888969`, name `updater-ci`, GitHub Actions app `15368` / `github-actions`, success; details point to workflow run `41826696674`, job `126563888969` |
| Intended workflow | Run records name `FWCloud-Updater CI`, path `.github/workflows/nodejs.yml`, workflow ID `4095626`; the job definition and dependencies agree |

The observable branch/ruleset configuration does not establish any protection
on either target. Protection was **not configured** by this review. Required
checks, strictness, obsolete checks and administrative exceptions cannot be
certified from an inaccessible protection endpoint. A green aggregate only
establishes successful execution.

An administrator must configure both exact branches, preserving any additional
repository requirements, then export and reread the effective settings. For new
classic branch-protection rules, the requested settings are:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [],
    "checks": [
      { "context": "updater-ci", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Apply through the GitHub settings UI or authenticated
`PUT /repos/soltecsis/fwcloud-updater/branches/{ENS|main}/protection`.
The zero review count requires the PR workflow without introducing a new approval
count policy. Require only `updater-ci` **for this CI workflow**, removing obsolete
`FWCloud-Updater Test (18|20|22)` requirements and any superseded individual
matrix names. Preserve unrelated required checks. Do not overwrite stronger
existing review/restriction settings with this new-rule example.

A ruleset alternative must be active for `refs/heads/ENS` and
`refs/heads/main`, require PRs and strict `updater-ci` from integration
`15368`, and have no administrator/team/app bypass that defeats these rules.
No bypass is intended by this configuration. If an exception is retained,
record its exact actors, purpose, authorization and scope before acceptance.
The app binding verifies the expected status producer; it does not independently
pin a workflow file. Recheck the named status's workflow/run association.

Verify through effective settings and protected PRs, using the normal merge path
without an administrative bypass:

| Scenario | Required observation | Recorded result |
| --- | --- | --- |
| Missing `updater-ci` | Merge unavailable while the required context is absent | Pending; no protected fixture PR |
| Pending `updater-ci` | Merge unavailable before completion | Pending |
| Failed `updater-ci` | Merge rejected; preserve native failure and upload evidence | Pending |
| Branch behind target | Merge unavailable until updated and required checks rerun | Pending |
| Current branch, all controls successful | Normal protected merge succeeds; record PR and resulting SHA | Pending; previous unprotected merges do not establish this |

Local aggregate tests cover failure/skipped/cancelled results, including the
documented Sonar exclusions. They cannot establish these server-side outcomes.
For each hosted failure test, retain the PR, head SHA, run/attempt, failing job,
artifact IDs and observed merge state. Use test fixtures without real credentials.

### 10.5. Effective retention and failure evidence

At the reviewed revision, the three test archives and coverage request **14
days** in both the workflow and upload logs; GitHub expiry is
`2026-11-18`, approximately 14 days after creation. This is an implementation
gap, not an established platform limitation. The local workflow now requests
**90 days** for both uploads; that change is not deployed or remotely verified.

Gitleaks, SCA/SBOM and Sonar request **90 days**; GitHub records
`2027-02-02T12:08:28Z` as their expiry, approximately 90 days after the run
started. This corroborates effective 90-day retention for those sampled archives.
It does not establish a global repository/organization retention setting.

The administrative retention-setting read
`GET /repos/soltecsis/fwcloud-updater/actions/permissions/artifact-and-log-retention`
is unsupported by the connected fetch tool, and no alternate authenticated
administrator connection was available. Repository/organization limits remain
unverified. Inspect those settings and newly uploaded test/coverage expiry after
deployment; record any actual cap with its source and approved disposition.
Existing 14-day archives are not extended by changing the workflow.

Failure uploads are structurally enabled after attempted tests/Gitleaks scans,
always for SCA evidence, and after successful Sonar checkout, preserving native
job failure. Existing local fixtures verify collector/aggregate behavior.
No failed hosted execution from the modernized workflow was reviewed; successful
upload steps and simulated failures in CI tooling tests do not prove publication
after an actual failing check. Still required:

- Tests and validation failure: JUnit/JSON/metadata plus available coverage
  survive; invalid coverage must not become valid `analysis.json`.
- Gitleaks findings/scanner errors: sanitized metadata survives, detailed findings
  are removed and `secrets`/`updater-ci` remain unsuccessful.
- Trivy HIGH/CRITICAL findings and scanner/SBOM errors: available diagnostic
  evidence survives and `sca`/`updater-ci` remain unsuccessful.
- Sonar failed gate, token/preparation/download errors and scanner errors:
  available aggregate metadata survives and eligible `sonar`/`updater-ci`
  remain unsuccessful.
- Earlier-attempt coverage reuse and a Node 22 producer rerun: validate current
  consumer/producer attempts, overwrite behavior and LCOV checksum.
- Inspect retained failure logs, rendered summaries and artifacts for sensitive
  context as well as correctness.

Checkout, setup and installation failures can prevent some control artifacts from
existing; cancelled runs are not guaranteed to upload. Record that condition
explicitly rather than presenting unavailable evidence as a passed control.

### 10.6. Rollout state and closure register

Promotion remains blocked because protection and the remaining acceptance
checks must pass first. No remote branch was changed
during this review.

| Branch | GitHub head observed on 2026-11-04 | Modernized execution / rollout state |
| --- | --- | --- |
| `ENS` | `04e39b3adf742f259611d017891e3f28903d2899` | All current jobs successful in reviewed run `41826696674`; final local retention/docs changes not deployed |
| `main` | `47d29843e9633481377613520711f516b3b5f3ce` | Modernization not promoted; no final modernized CI execution |
| `devel` | `8b0a5802b8d304df551db17919911dcefe152488` | Not yet aligned with `ENS` |

| Rollout step | Status and required evidence |
| --- | --- |
| Validate CI on `ENS` | Successful current implementation reviewed; publish final changes, record their PR/SHA and rerun |
| Review evidence and effective protection | Artifacts/logs reviewed; rendered summaries, failure cases, retention limits and protection pending |
| Confirm `updater-ci` enforcement | Pending administrative settings and negative/positive protected-PR outcomes |
| Record accepted revision before promotion | **No accepted rollout SHA yet**; `04e39b3...` is the reviewed candidate, not final acceptance |
| Promote `ENS` to `main` | Pending all prior acceptance; use a protected PR and record accepted source SHA, PR and resulting full SHA |
| Verify resulting `main` execution | Pending promotion; review complete required jobs and evidence on the resulting commit |
| Align `devel` | Pending successful `main` validation; record integration PR, resulting full SHA and complete CI run |
| Close documentation | Pending final branch heads, run/artifact links, settings snapshot, verification date, responsible reviewer and outstanding-issue disposition |

The retention fix is committed as `ba316f2357804414cfa9c2346e4434bc870c9453`.
This documentation commit records the evidence and README guidance. Its PR,
`ENS` run, effective expiry and any later rollout references must be added after
those events occur. Do not use placeholder links,
earlier successful runs or merged-code status as substitutes.

Local validation of these final changes on 2026-11-04 (Codex automated review):

| Check | Result |
| --- | --- |
| `node --test scripts/sonar-workflow.test.cjs` | Passed |
| Actionlint `1.7.7`, `-shellcheck=` | Passed; ShellCheck unavailable and disabled |
| YAML inspection of artifact upload definitions | All five upload definitions request 90 days |
| README/CI documentation local links and JSON example parsing | Passed |
| `git diff --check` | Passed |

These checks do not replace a hosted run of the final implementation commit.

Administrative API references:
[branch protection](https://docs.github.com/en/rest/branches/branch-protection),
[repository rulesets](https://docs.github.com/en/rest/repos/rules),
[artifact and log retention](https://docs.github.com/en/rest/actions/permissions#get-artifact-and-log-retention-settings-for-a-repository).
