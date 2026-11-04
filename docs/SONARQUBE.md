# SonarQube Cloud for FWCloud Updater

## Deployment status and administrative setup

This integration follows FWCloud API Phase 7, adapted to Updater's Jest matrix.
Hosted acceptance is **pending**. The proposed project key is
`soltecsis_fwcloud-updater` in organization `soltecsis`; its actual existence,
permissions and Quality Gate have not been verified. Complete these prerequisites
before enabling the workflow on a protected branch:

- [ ] Identify or create the correct Updater project; record its dashboard URL
  and keys. If different, update `sonar-project.properties` and the helper's
  configuration validation together.
- [ ] Grant the SonarQube Cloud GitHub App access to
  `soltecsis/fwcloud-updater` and verify the project's repository binding.
- [ ] Disable **Automatic Analysis** and select CI-based analysis.
- [ ] Assign the intended Quality Gate and new-code definition. Record their
  actual conditions and verify a passing and a failing internal PR.
- [ ] Confirm the plan supports `ENS`, other configured branches and internal
  PRs. Do not infer this from the API project's subscription or trial.
- [ ] Configure `SONAR_TOKEN` as an Actions repository secret or an organization
  secret accessible to Updater, with analysis permission for the correct project.
  Record responsibility for expiration and renewal.
- [ ] Require `updater-ci` through GitHub branch rules and verify merge blocking.

Token values never belong in properties, arguments, documentation or artifacts.
`SONAR_TOKEN` is supplied only to the official scanner step. A missing or invalid
token in an eligible execution fails; there is no credentials-based skip policy.
Preparation receives only a token-presence boolean and fails explicitly when it
is false; it never receives the credential itself.

## Scanner scope and TypeScript

`sonar-project.properties` selects Cloud EU at `https://sonarcloud.io`, production
roots `src,config`, test root `src` and test inclusions `**/*.spec.ts`. The same
specification pattern is excluded from production, preventing duplicate indexing
across overlapping roots. Declarations, other test suffixes, generated files,
build output, dependencies and reports are excluded from production analysis.
`test/`, including JSON fixtures and the HTTP integration test, is outside the
analysis roots; that test still executes in Jest. Phase 2 coverage already
includes `config/**/*.ts`. The service unit under `config/sys/` is not a JS/TS
coverage input. SCM exclusions are disabled so `.gitignore` cannot silently hide
explicitly selected sources.

The standalone `tsconfig.sonar.json` affects analysis only. It preserves CommonJS,
ES2017, decorators and the `src/*` alias without inheriting TypeScript 6's
`ignoreDeprecations: "6.0"`, deprecated `baseUrl` or build settings. Its scope
includes application files and colocated specifications. The scanner supplies
its own TypeScript analyzer; pinning the CLI does not establish TypeScript 6
compatibility. Hosted indexing, warnings and type inference still need review.
No dependencies are installed in this job, which can reduce available external
type information. The production TSConfig and build remain unchanged.

## Execution policy

`sonar`, named **FWCloud-Updater SonarQube**, depends on successful `quality`,
`test`, `secrets` and `sca` jobs and has a 20-minute timeout. Checkout uses
`ANALYSIS_COMMIT`, full history and `persist-credentials: false`. For PRs this is
the tested head SHA, rather than GitHub's synthetic merge SHA. The helper checks
Git HEAD and generates revision, branch or PR arguments from that execution.

| Execution | Required Sonar result in `updater-ci` |
| --- | --- |
| Push to `main`, `devel` or `ENS` | `success` |
| Internal PR targeting those branches | `success` |
| Manual run | `success` |
| Fork PR, Dependabot actor or Dependabot PR author | `skipped` |

The aggregate applies the same eligibility rule and records skip reasons in the
Actions summary. Quality, all Node 20/22/24 tests, Gitleaks and Trivy remain
mandatory for every execution. Upstream failures cannot pass through the Sonar
exception. After an external PR merges into `ENS`, the resulting push runs Sonar
unless its actor is Dependabot. Fork PRs do not receive pre-merge Sonar analysis.

The official action is
`SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9`
(v8.3.0), using CLI `8.1.0.6389` with signature verification enabled. Sonar does
not rebuild, install npm dependencies or rerun Jest. No separate workflow or
latest-branch lookup participates in analysis.

## Coverage validation and partial reruns

The existing Node 22 job publishes `updater-coverage-node22-<RUN_ID>`. The download
selects that exact artifact from the current Actions run. The archive's root
contains the coverage files; validated bytes are copied to
`reports/coverage/lcov.info` for the scanner.

`scripts/sonar-analysis.cjs` validates the Phase 2 `analysis.json` contract:

- Matching repository, checkout commit, event and workflow run ID.
- Positive producer/consumer attempts; the producer cannot be newer than the
  analysis. Earlier attempts of the same run and commit are accepted.
- Node `22.x`, `testOutcome: "success"`, `coverageExpected: true`, successful
  Jest counters with executed tests, no failed tests/suites and no report errors.
- Nonempty LCOV matching `lcov.path` and `lcov.sha256`; coverage metrics and
  `coverage-summary.json` agree with the evidence.
- Complete records referencing existing original production sources under
  `src/` or `config/`. Absolute paths, traversal, generated files, declarations,
  specifications and missing files are rejected. Symlinks anywhere in either
  analyzed tree are rejected, even when absent from LCOV.
- Scanner properties preserve the project, scope, coverage import and blocking
  300-second Quality Gate policy.

The helper never discards unexpected sources or generates replacement coverage.
The hash binds LCOV bytes to producer metadata; it does not independently certify
PR-controlled tests or replace review.

Rerunning only Sonar can reuse valid earlier coverage from the same execution.
Rerunning the Node 22 producer replaces that run's artifact using
`overwrite: true`, with its new producer attempt in metadata. Invalid coverage
requires rerunning the producer or all jobs. Changed code needs a new run on the
new commit; a rerun retains the original revision. Other runs are never searched.

## Quality Gate and execution evidence

`sonar.qualitygate.wait=true` and `sonar.qualitygate.timeout=300` make the scanner
wait for the gate. A failed gate, timeout, authentication failure or scanner error
fails `sonar` and `updater-ci` on eligible executions. The assigned gate and
new-code definition are server-side settings; repository configuration cannot
verify them. No unconfirmed thresholds are prescribed here.

`reports/sonar/metadata.json` is uploaded as
`updater-sonarqube-<RUN_ID>-<ATTEMPT>` with 90 days of requested retention. It
identifies the commit, repository, branch/PR, run, analysis attempt, coverage
producer attempt, LCOV/configuration checksums, scanner identity and outcome.
Available context is retained after preparation or scanner failures; unavailable
coverage is not presented as validated. Failed or unexecuted scans never become
passed gates. Uploading evidence cannot override scanner failure.

Only that metadata file is uploaded: no credentials, raw scanner logs, sources or
`.scannerwork`. Detailed findings remain in SonarQube Cloud. Verify the hosted
artifact contents and effective retention during acceptance.

## Local procedure

Run the regression suite under Node 22 with existing project dependencies:

```bash
npm run test:ci-tools
npm run lint:ci
npm run format:ci
```

For optional local analysis, install a signature-verified SonarScanner CLI
`8.1.0.6389` separately. Generate coverage once at the exact revision and keep
the same context for reporting and analysis. These local run identifiers are
diagnostic and do not constitute hosted Actions evidence:

```bash
export ANALYSIS_COMMIT="$(git rev-parse HEAD)"
export GITHUB_REPOSITORY=soltecsis/fwcloud-updater
export GITHUB_EVENT_NAME=workflow_dispatch
export GITHUB_REF_NAME="$(git branch --show-current)"
export GITHUB_REF="refs/heads/$GITHUB_REF_NAME"
export GITHUB_RUN_ID=1
export GITHUB_RUN_ATTEMPT=1
npm run test:coverage:ci
TEST_OUTCOME=success COVERAGE_EXPECTED=true npm run ci:reports
node scripts/sonar-analysis.cjs prepare
```

Pass the emitted, validated arguments to `sonar-scanner`, supplying `SONAR_TOKEN`
only to that process through your local secret mechanism. Do not paste it into a
command, file or log. For PR context use `GITHUB_EVENT_NAME=pull_request`,
`PR_NUMBER`, `GITHUB_HEAD_REF` and `GITHUB_BASE_REF` matching the coverage producer.
After scanner success and a passed gate, record evidence with:

```bash
SCAN_OUTCOME=success ANALYSIS_OUTCOME=success node scripts/sonar-analysis.cjs record
```

Use `SCAN_OUTCOME=failure` after a scanner failure and preserve its nonzero exit
status. The helper records execution evidence; it does not run the scanner or
independently query the gate.

## Acceptance still pending

Complete administrative verification, then run the final implementation commit
in Actions. Record the run URL, analyzed SHA, Sonar project/analysis URL and gate
result. Exercise an `ENS` push, internal PR, fork PR, Dependabot execution and
post-merge push. Verify source/test indexing, LCOV resolution, TypeScript analysis,
failed gate, missing/invalid token, scanner error and partial Sonar rerun. Confirm
sanitized failure artifacts, producer/consumer attempts and effective branch
protection. Local checks cannot establish remote credentials or plan entitlement.

Implementation and validation evidence are recorded in
[CI-UPDATER.md](../.github/CI-UPDATER.md).

## Official references

- [Pinned scan action](https://github.com/SonarSource/sonarqube-scan-action/blob/d209202bc7d53ff1cc128f7f907dac145c9d6ae9/action.yml)
- [JS/TS analysis and dedicated TSConfig](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/languages/javascript-typescript-css/)
- [Source and test patterns](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/project-analysis/setting-analysis-scope/excluding-files-based-on-patterns)
