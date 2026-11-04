const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const script = path.join(__dirname, 'gitleaks-report.cjs');
const git = (...args) =>
  execFileSync('git', args, { cwd: __dirname, encoding: 'utf8' }).trim();
const gitDir = git('rev-parse', '--absolute-git-dir');
const head = git('rev-parse', 'HEAD');
// Every field Gitleaks can report besides the rule must stay private.
const PRIVATE = 'DO_NOT_EXPOSE_THIS_VALUE';
const FINDING = {
  RuleID: 'generic-api-key',
  Description: PRIVATE,
  StartLine: 7,
  Match: PRIVATE,
  Secret: PRIVATE,
  File: `src/${PRIVATE}.ts`,
  Line: PRIVATE,
  Commit: PRIVATE,
  Author: PRIVATE,
  Email: `${PRIVATE}@example.invalid`,
  Message: PRIVATE,
  Fingerprint: `${PRIVATE}:src/file.ts:generic-api-key:7`,
};

function collect(t, report, exitCode, extraEnv = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'fwcloud-updater-gitleaks-report-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, 'gitleaks.json');
  const metadataPath = path.join(directory, 'secrets', 'metadata.json');
  const summaryPath = path.join(directory, 'summary.md');
  if (report !== undefined)
    fs.writeFileSync(
      reportPath,
      typeof report === 'string' ? report : JSON.stringify(report),
    );
  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_DIR: gitDir,
      ANALYSIS_COMMIT: head,
      GITLEAKS_REPORT_PATH: reportPath,
      GITLEAKS_METADATA_PATH: metadataPath,
      GITLEAKS_EXIT_CODE: String(exitCode),
      GITLEAKS_LOG_LINES: '0',
      GITLEAKS_VERSION: '8.30.1',
      GITLEAKS_SCAN_SCOPE: 'test-range',
      GITLEAKS_LOG_OPTS: 'base..head',
      GITHUB_STEP_SUMMARY: summaryPath,
      ...extraEnv,
    },
  });
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const summary = fs.readFileSync(summaryPath, 'utf8');
  const published = [
    JSON.stringify(metadata),
    summary,
    result.stdout,
    result.stderr,
  ].join('\n');
  return { result, metadata, summary, published };
}

test('accepts a complete scan without findings', (t) => {
  const { result, metadata, summary } = collect(t, [], 0);
  assert.equal(result.status, 0, result.stderr);
  // Published evidence is a fixed set of aggregate fields.
  assert.deepEqual(Object.keys(metadata).sort(), [
    'collectedAt',
    'commit',
    'errors',
    'event',
    'exitCode',
    'findingCount',
    'gitleaksVersion',
    'logOptions',
    'ref',
    'repository',
    'ruleIds',
    'runAttempt',
    'runId',
    'scanScope',
    'scannerLogLines',
    'schemaVersion',
    'status',
  ]);
  assert.equal(metadata.status, 'success');
  assert.equal(metadata.scannerLogLines, 0);
  assert.equal(metadata.commit, head);
  assert.equal(metadata.gitleaksVersion, '8.30.1');
  assert.equal(metadata.scanScope, 'test-range');
  assert.equal(metadata.logOptions, 'base..head');
  assert.equal(metadata.exitCode, 0);
  assert.equal(metadata.findingCount, 0);
  assert.deepEqual(metadata.ruleIds, []);
  assert.deepEqual(metadata.errors, []);
  assert.match(summary, /Status: \*\*SUCCESS\*\*/);
});

test('fails on findings and publishes only aggregate rule information', (t) => {
  const { result, metadata, summary, published } = collect(
    t,
    [
      { ...FINDING, RuleID: 'private-key' },
      FINDING,
      { ...FINDING, StartLine: 9 },
    ],
    1,
  );
  assert.equal(result.status, 1);
  assert.equal(metadata.status, 'findings');
  assert.equal(metadata.findingCount, 3);
  assert.deepEqual(metadata.ruleIds, ['generic-api-key', 'private-key']);
  assert.deepEqual(metadata.errors, []);
  assert.match(summary, /Status: \*\*FINDINGS\*\*/);
  assert.ok(!published.includes(PRIVATE));
  assert.ok(!published.includes('StartLine'));
});

test('treats a missing report as an incomplete scan', (t) => {
  const { result, metadata } = collect(t, undefined, 0);
  assert.equal(result.status, 1);
  assert.equal(metadata.status, 'error');
  assert.equal(metadata.findingCount, null);
});

test('does not copy malformed report content into evidence', (t) => {
  // V8 quotes short invalid JSON input in its SyntaxError message.
  const file = 'leak/path.ts';
  for (const report of [file, `"${file}`, `[{"File":"${file}"`]) {
    const { result, metadata, published } = collect(t, report, 1);
    assert.equal(result.status, 1);
    assert.equal(metadata.status, 'error');
    assert.ok(!published.includes(file), report);
  }
});

test('rejects reports that are not arrays of findings with safe rule ids', (t) => {
  for (const report of [
    {},
    [null],
    ['finding'],
    [{ ...FINDING, RuleID: undefined }],
    [{ ...FINDING, RuleID: `${PRIVATE} <b>` }],
  ]) {
    const { result, metadata, published } = collect(t, report, 1);
    assert.equal(result.status, 1, JSON.stringify(report));
    assert.equal(metadata.status, 'error', JSON.stringify(report));
    assert.ok(!published.includes(PRIVATE), JSON.stringify(report));
  }
  const { metadata } = collect(t, [null, FINDING], 1);
  assert.equal(metadata.findingCount, 2);
  assert.deepEqual(metadata.ruleIds, ['generic-api-key']);
});

test('rejects results inconsistent with the scanner exit code', (t) => {
  for (const [report, exitCode] of [
    [[], 1],
    [[FINDING], 0],
    [[], 2],
    [[FINDING], 126],
  ]) {
    const { result, metadata } = collect(t, report, exitCode);
    assert.equal(result.status, 1, `${report.length} findings, ${exitCode}`);
    assert.equal(metadata.status, 'error');
  }
});

test('rejects a missing or invalid scanner exit code', (t) => {
  for (const exitCode of ['', 'x', '-1', '1.0', ' 0']) {
    const { result, metadata } = collect(t, [], exitCode);
    assert.equal(result.status, 1, JSON.stringify(exitCode));
    assert.equal(metadata.status, 'error');
    assert.equal(metadata.exitCode, null);
  }
});

test('treats scanner log output as an incomplete scan', (t) => {
  // Gitleaks 8.30.1 exits 0 with an empty report when git fails.
  for (const [report, exitCode, logLines] of [
    [[], 0, '2'],
    [[FINDING], 1, '1'],
  ]) {
    const { result, metadata } = collect(t, report, exitCode, {
      GITLEAKS_LOG_LINES: logLines,
    });
    assert.equal(result.status, 1, logLines);
    assert.equal(metadata.status, 'error');
    assert.equal(metadata.scannerLogLines, Number(logLines));
    assert.equal(metadata.findingCount, report.length);
  }
  for (const logLines of ['', 'x', '-1']) {
    const { result, metadata } = collect(t, [], 0, {
      GITLEAKS_LOG_LINES: logLines,
    });
    assert.equal(result.status, 1, JSON.stringify(logLines));
    assert.equal(metadata.status, 'error');
    assert.equal(metadata.scannerLogLines, null);
  }
});

test('rejects a checkout mismatch and retains the actual commit', (t) => {
  const { result, metadata } = collect(t, [], 0, {
    ANALYSIS_COMMIT: '0'.repeat(40),
  });
  assert.equal(result.status, 1);
  assert.equal(metadata.status, 'error');
  assert.equal(metadata.commit, head);
});
