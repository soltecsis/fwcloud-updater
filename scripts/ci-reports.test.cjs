const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const script = path.join(__dirname, 'ci-reports.cjs');
const git = (...args) =>
  execFileSync('git', args, { cwd: __dirname, encoding: 'utf8' }).trim();
const gitDir = git('rev-parse', '--absolute-git-dir');
const head = git('rev-parse', 'HEAD');
const START = 1700000000000;
const PRIVATE = 'DO_NOT_INCLUDE_IN_SUMMARY';
const JUNIT = `<?xml version="1.0"?>
<testsuites name="${PRIVATE}">
  <testsuite tests="3" failures="0" errors="0" skipped="1">
    <testcase name="${PRIVATE}"/><testcase/><testcase><skipped/></testcase><testcase/>
  </testsuite>
</testsuites>`;
const RESULTS = {
  success: true,
  numTotalTestSuites: 1,
  numFailedTestSuites: 0,
  numTotalTests: 4,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 1,
  numTodoTests: 1,
  startTime: START,
  testResults: [
    {
      name: PRIVATE,
      message: PRIVATE,
      startTime: START + 500,
      endTime: START + 3750,
      assertionResults: [{ fullName: PRIVATE, failureMessages: [PRIVATE] }],
    },
  ],
};
const LCOV = `TN:
SF:src/example.ts
FN:1,first
FN:2,second
FN:3,third
FN:4,fourth
FNF:4
FNH:1
FNDA:1,first
FNDA:0,second
FNDA:0,third
FNDA:0,fourth
DA:1,1
DA:2,0
DA:3,0
DA:4,0
LF:4
LH:1
BRDA:1,0,0,1
BRDA:1,0,1,0
BRDA:2,1,0,-
BRDA:2,1,1,0
BRF:4
BRH:1
end_of_record
`;
function reports(coverage = false) {
  const files = {
    'reports/tests/junit.xml': JUNIT,
    'reports/tests/results.json': structuredClone(RESULTS),
  };
  if (coverage) {
    const metric = { total: 4, covered: 1, skipped: 0, pct: 25 };
    files['reports/coverage/lcov.info'] = LCOV;
    files['reports/coverage/coverage-summary.json'] = {
      total: Object.fromEntries(
        ['lines', 'statements', 'functions', 'branches'].map((key) => [
          key,
          { ...metric },
        ]),
      ),
    };
    files['reports/coverage/index.html'] = '<html><body>coverage</body></html>';
  }
  return files;
}

function run(t, files = reports(), env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-ci-reports-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(
      path.join(dir, file),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_DIR: gitDir,
      ANALYSIS_COMMIT: head,
      GITHUB_SHA: 'unrelated-merge-commit',
      GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
      GITHUB_RUN_ID: '1234',
      GITHUB_RUN_ATTEMPT: '2',
      TEST_OUTCOME: 'success',
      COVERAGE_EXPECTED: 'false',
      ...env,
    },
  });
  assert.equal(result.error, undefined);
  const read = (file) =>
    fs.existsSync(path.join(dir, file))
      ? fs.readFileSync(path.join(dir, file), 'utf8')
      : null;
  const summary = read('summary.md');
  assert.ok(summary, result.stderr);
  assert.ok(!summary.includes(PRIVATE));
  return {
    status: result.status,
    stderr: result.stderr,
    metadata: JSON.parse(read('reports/metadata.json')),
    summary,
    read,
  };
}

test('records aggregate statistics, skipped/todo counts, duration and the actual checkout', (t) => {
  const { status, stderr, metadata, read, summary } = run(t);
  assert.equal(status, 0, stderr);
  assert.equal(metadata.commit, head);
  assert.equal(metadata.node, process.version);
  assert.equal(metadata.runId, '1234');
  assert.equal(metadata.runAttempt, '2');
  assert.equal(metadata.tests.executed, 2);
  assert.equal(metadata.tests.numPendingTests, 1);
  assert.equal(metadata.tests.numTodoTests, 1);
  assert.equal(metadata.tests.durationMs, 3750);
  assert.equal(metadata.coverage, null);
  assert.deepEqual(metadata.errors, []);
  assert.equal(read('reports/coverage/analysis.json'), null);
  assert.ok(summary.includes('| 1 | 0 | 4 | 2 | 2 | 0 | 1 | 1 | 3750 |'));
});

for (const file of ['reports/tests/junit.xml', 'reports/tests/results.json']) {
  for (const state of ['missing', 'empty', 'whitespace', 'malformed']) {
    test(`rejects ${state} ${file} and still writes metadata`, (t) => {
      const files = reports();
      if (state === 'missing') delete files[file];
      else
        files[file] = { empty: '', whitespace: ' \n', malformed: '<broken>' }[
          state
        ];
      const result = run(t, files);
      assert.equal(result.status, 1);
      assert.ok(result.metadata.errors.some((error) => error.includes(file)));
    });
  }
}

for (const xml of [
  '<testsuites></testsuites>',
  JUNIT.replace('<testcase/>', '<testcase>'),
  JUNIT.replace('tests="3"', 'tests="invalid"'),
  JUNIT.replace('tests="3"', 'tests="2"'),
  JUNIT.replace('<skipped/>', ''),
  JUNIT.replace(
    '<testcase/>',
    `<testcase><failure>${PRIVATE}</failure></testcase>`,
  ),
  JUNIT.replace(
    '<testcase/>',
    `<testcase><error>${PRIVATE}</error></testcase>`,
  ),
  JUNIT.replace('errors="0"', 'errors="1"'),
]) {
  test('rejects malformed, incomplete, inconsistent or failed JUnit XML', (t) => {
    const files = { ...reports(), 'reports/tests/junit.xml': xml };
    assert.equal(run(t, files).status, 1);
  });
}

for (const [label, changes] of [
  ['failed tests', { numFailedTests: 1, numPassedTests: 1 }],
  ['failed suites', { numFailedTestSuites: 1 }],
  ['unsuccessful Jest', { success: false }],
  ['missing success', { success: null }],
  ['negative counters', { numPendingTests: -1 }],
  ['noninteger counters', { numTotalTests: 4.5 }],
  ['missing counters', { numTodoTests: undefined }],
  ['inconsistent counters', { numTotalTests: 20 }],
  ['missing timing', { startTime: undefined }],
  ['missing suites', { testResults: [] }],
  [
    'invalid timing',
    { testResults: [{ startTime: START, endTime: START - 1 }] },
  ],
  ['zero executed tests', { numPassedTests: 0, numPendingTests: 3 }],
  [
    'zero tests',
    {
      numTotalTests: 0,
      numPassedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
    },
  ],
]) {
  test(`rejects ${label} in Jest JSON`, (t) => {
    const files = reports();
    Object.assign(files['reports/tests/results.json'], changes);
    assert.equal(run(t, files).status, 1);
  });
}

for (const outcome of ['failure', 'cancelled', 'skipped', 'unknown']) {
  test(`preserves test step outcome ${outcome}`, (t) => {
    assert.equal(run(t, reports(), { TEST_OUTCOME: outcome }).status, 1);
  });
}

test('rejects a checkout mismatch and retains the actual commit in metadata', (t) => {
  const { status, metadata } = run(t, reports(), {
    ANALYSIS_COMMIT: '0'.repeat(40),
  });
  assert.equal(status, 1);
  assert.equal(metadata.commit, head);
});

for (const file of ['lcov.info', 'coverage-summary.json', 'index.html']) {
  for (const state of ['missing', 'empty', 'malformed']) {
    test(`rejects ${state} coverage ${file}`, (t) => {
      const files = reports(true);
      if (state === 'missing') delete files[`reports/coverage/${file}`];
      else
        files[`reports/coverage/${file}`] = state === 'empty' ? '' : 'broken';
      const result = run(t, files, { COVERAGE_EXPECTED: 'true' });
      assert.equal(result.status, 1);
      assert.equal(result.read('reports/coverage/analysis.json'), null);
    });
  }
}

for (const lcov of [
  'SF:src/example.ts\n',
  'SF:src/example.ts\nend_of_record\n',
  LCOV.replace('LF:4', 'LF:99'),
  LCOV.replace('DA:1,1', 'DA:1,0'),
  LCOV.replace('DA:1,1', 'DA:1,-1'),
  LCOV.replace('FNDA:1,first', 'FNDA:0,first'),
  LCOV.replace('BRDA:1,0,0,1', 'BRDA:1,0,0,0'),
  LCOV + LCOV,
  LCOV.replace('src/example.ts', 'src/types/vendor-modules.d.ts'),
  LCOV.replace('src/example.ts', 'src/example.spec.ts'),
  LCOV.replace('src/example.ts', 'scripts/example.js'),
]) {
  test('rejects incorrect LCOV records, counters or source scope', (t) => {
    const files = { ...reports(true), 'reports/coverage/lcov.info': lcov };
    const result = run(t, files, { COVERAGE_EXPECTED: 'true' });
    assert.equal(result.status, 1);
    assert.equal(result.read('reports/coverage/analysis.json'), null);
  });
}

for (const metric of [
  { pct: 101 },
  { pct: '25' },
  { pct: 50 },
  { covered: 5 },
  { total: -1 },
  { total: 0, covered: 0, pct: 100 },
  { total: 8, covered: 2, pct: 25 },
]) {
  test('rejects invalid coverage metrics and disagreement with LCOV', (t) => {
    const files = reports(true);
    Object.assign(
      files['reports/coverage/coverage-summary.json'].total.lines,
      metric,
    );
    assert.equal(run(t, files, { COVERAGE_EXPECTED: 'true' }).status, 1);
  });
}

test('removes stale analysis on failure while preserving diagnostic coverage', (t) => {
  const files = {
    ...reports(true),
    'reports/coverage/analysis.json': { stale: true },
  };
  const result = run(t, files, {
    COVERAGE_EXPECTED: 'true',
    TEST_OUTCOME: 'failure',
  });
  assert.equal(result.status, 1);
  assert.equal(result.read('reports/coverage/analysis.json'), null);
  assert.equal(result.read('reports/coverage/lcov.info'), LCOV);
});

test('writes analysis with runtime, attempt, metrics and SHA-256 of the exact LCOV bytes', (t) => {
  const files = reports(true);
  // Include CRLF to prove hashing is performed on bytes, without normalization.
  files['reports/coverage/lcov.info'] = LCOV.replaceAll('\n', '\r\n');
  const result = run(t, files, { COVERAGE_EXPECTED: 'true' });
  assert.equal(result.status, 0, result.stderr);
  const analysis = JSON.parse(result.read('reports/coverage/analysis.json'));
  assert.equal(analysis.commit, head);
  assert.equal(analysis.node, process.version);
  assert.equal(analysis.runAttempt, '2');
  assert.ok(Date.parse(analysis.collectedAt));
  assert.deepEqual(analysis.lcov, {
    path: 'reports/coverage/lcov.info',
    sha256: crypto
      .createHash('sha256')
      .update(files['reports/coverage/lcov.info'])
      .digest('hex'),
  });
  assert.deepEqual(analysis.coverage, result.metadata.coverage);
  assert.ok(result.summary.includes('| lines | 25 |'));
});
