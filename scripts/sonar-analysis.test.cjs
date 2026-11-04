const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const {
  verifyCoverage,
  prepare,
  recordEvidence,
  scannerConfiguration,
} = require('./sonar-analysis.cjs');

const script = path.join(__dirname, 'sonar-analysis.cjs');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const PRIVATE = 'DO_NOT_INCLUDE_SCANNER_CREDENTIALS';
const reference = {
  repository: 'soltecsis/fwcloud-updater',
  commit: 'a'.repeat(40),
  runId: '1234',
  runAttempt: '2',
  event: 'push',
};
const record = (source = 'src/example.ts') => `TN:
SF:${source}
FN:1,first
FNF:1
FNH:1
FNDA:1,first
DA:1,1
DA:2,0
LF:2
LH:1
BRDA:1,0,0,1
BRDA:1,0,1,0
BRF:2
BRH:1
end_of_record
`;
const lcov = Buffer.from(record());
const metrics = (multiplier = 1) => ({
  lines: { total: 2 * multiplier, covered: multiplier, skipped: 0, pct: 50 },
  statements: {
    total: 2 * multiplier,
    covered: multiplier,
    skipped: 0,
    pct: 50,
  },
  functions: { total: multiplier, covered: multiplier, skipped: 0, pct: 100 },
  branches: { total: 2 * multiplier, covered: multiplier, skipped: 0, pct: 50 },
});
const evidence = (bytes = lcov) => ({
  ...reference,
  schemaVersion: 1,
  node: 'v22.20.0',
  testOutcome: 'success',
  coverageExpected: true,
  tests: {
    numTotalTestSuites: 2,
    numFailedTestSuites: 0,
    numTotalTests: 5,
    numPassedTests: 3,
    numFailedTests: 0,
    numPendingTests: 1,
    numTodoTests: 1,
    executed: 3,
    success: true,
    startTime: 1700000000000,
    durationMs: 100,
  },
  coverage: metrics(),
  errors: [],
  lcov: { path: 'reports/coverage/lcov.info', sha256: digest(bytes) },
});

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-sonar-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, file, content) {
  const target = path.join(dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    Buffer.isBuffer(content) || typeof content === 'string'
      ? content
      : JSON.stringify(content),
  );
}

function checkout(t, event = 'push') {
  const directory = temporary(t);
  const source = path.join(directory, 'source');
  const coverage = path.join(directory, 'coverage');
  fs.mkdirSync(source);
  fs.mkdirSync(coverage);
  write(source, 'src/example.ts', 'export const a = 1;\nexport const b = 2;\n');
  write(source, 'src/example.spec.ts', 'test("example", () => {});\n');
  write(source, 'config/example.ts', 'export const config = true;\n');
  for (const file of ['sonar-project.properties', 'tsconfig.sonar.json']) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(source, file));
  }
  execFileSync('git', ['init', '--quiet', source]);
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', [
    '-C',
    source,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const env = {
    GITHUB_REPOSITORY: reference.repository,
    GITHUB_RUN_ID: reference.runId,
    GITHUB_RUN_ATTEMPT: reference.runAttempt,
    GITHUB_EVENT_NAME: event,
    GITHUB_REF:
      event === 'pull_request' ? 'refs/pull/7/merge' : 'refs/heads/ENS',
    GITHUB_REF_NAME: event === 'pull_request' ? '7/merge' : 'ENS',
    ANALYSIS_COMMIT: commit,
    ...(event === 'pull_request'
      ? {
          PR_NUMBER: '7',
          GITHUB_HEAD_REF: 'feature/sonar',
          GITHUB_BASE_REF: 'ENS',
        }
      : {}),
    GITHUB_STEP_SUMMARY: path.join(source, 'summary.md'),
    GITHUB_OUTPUT: path.join(source, 'output.txt'),
  };
  const metadata = { ...evidence(), commit, event };
  write(coverage, 'analysis.json', metadata);
  write(coverage, 'coverage-summary.json', { total: metrics() });
  write(coverage, 'lcov.info', lcov);
  return { source, coverage, env, metadata };
}

function cli(fixture, command, changes = {}, positional = true) {
  return spawnSync(
    process.execPath,
    [
      script,
      command,
      ...(command === 'prepare' && positional ? [fixture.coverage] : []),
    ],
    {
      cwd: fixture.source,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...fixture.env,
        SONAR_TOKEN: PRIVATE,
        COVERAGE_DIRECTORY: fixture.coverage,
        ...changes,
      },
    },
  );
}

for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
  test(`imports the existing LCOV and builds native scanner arguments for ${event}`, (t) => {
    const { source, coverage, env } = checkout(t, event);
    const result = prepare(source, coverage, env);
    assert.equal(result.metadata.commit, env.ANALYSIS_COMMIT);
    assert.equal(result.metadata.coverageReportSha256, digest(lcov));
    assert.equal(result.metadata.coverageRunAttempt, 2);
    assert.equal(
      result.metadata.coverageArtifact,
      'updater-coverage-node22-1234',
    );
    assert.equal(
      result.metadata.scannerSettingsSha256,
      digest(fs.readFileSync(path.join(source, 'sonar-project.properties'))),
    );
    assert.deepEqual(
      fs.readFileSync(path.join(source, 'reports/coverage/lcov.info')),
      lcov,
    );
    assert.ok(
      result.args.includes(`-Dsonar.scm.revision=${env.ANALYSIS_COMMIT}`),
    );
    if (event === 'pull_request') {
      assert.ok(result.args.includes('-Dsonar.pullrequest.key=7'));
      assert.ok(
        result.args.includes('-Dsonar.pullrequest.branch=feature/sonar'),
      );
      assert.ok(result.args.includes('-Dsonar.pullrequest.base=ENS'));
      assert.ok(!result.args.includes('-Dsonar.branch.name='));
    } else assert.ok(result.args.includes('-Dsonar.branch.name=ENS'));
  });
}

test('imports original config TypeScript coverage alongside src coverage', (t) => {
  const fixture = checkout(t);
  const data = Buffer.from(record() + record('config/example.ts'));
  write(fixture.coverage, 'lcov.info', data);
  write(fixture.coverage, 'analysis.json', {
    ...fixture.metadata,
    coverage: metrics(2),
    lcov: { path: 'reports/coverage/lcov.info', sha256: digest(data) },
  });
  write(fixture.coverage, 'coverage-summary.json', { total: metrics(2) });
  assert.equal(
    prepare(fixture.source, fixture.coverage, fixture.env).metadata.sourceCount,
    2,
  );
});

test('validates successful Jest evidence rather than a database matrix', () => {
  assert.deepEqual(verifyCoverage(evidence(), lcov, reference), [
    'src/example.ts',
  ]);
  assert.equal(evidence().database, undefined);
});

for (const [label, change] of [
  ['another commit', { commit: 'b'.repeat(40) }],
  ['another run', { runId: '5678' }],
  ['another repository', { repository: 'fork/fwcloud-updater' }],
  ['another event', { event: 'pull_request' }],
  ['unsupported schema', { schemaVersion: 2 }],
  ['Node 20', { node: 'v20.20.0' }],
  ['Node 24', { node: 'v24.0.0' }],
  ['malformed Node version', { node: 'v22.bad' }],
  ['failed test step', { testOutcome: 'failure' }],
  ['skipped test step', { testOutcome: 'skipped' }],
  ['no coverage collection', { coverageExpected: false }],
  ['missing Jest statistics', { tests: null }],
  ['failed Jest evidence', { tests: { ...evidence().tests, success: false } }],
  ['failed Jest tests', { tests: { ...evidence().tests, numFailedTests: 1 } }],
  [
    'failed Jest suites',
    { tests: { ...evidence().tests, numFailedTestSuites: 1 } },
  ],
  ['no executed Jest tests', { tests: { ...evidence().tests, executed: 0 } }],
  [
    'inconsistent Jest execution',
    { tests: { ...evidence().tests, executed: 4 } },
  ],
  [
    'inconsistent Jest counters',
    { tests: { ...evidence().tests, numTotalTests: 100 } },
  ],
  ['producer validation errors', { errors: ['incomplete'] }],
  ['missing validation status', { errors: null }],
  [
    'modified checksum',
    { lcov: { path: 'reports/coverage/lcov.info', sha256: 'a'.repeat(64) } },
  ],
  [
    'unexpected LCOV location',
    { lcov: { path: 'dist/lcov.info', sha256: digest(lcov) } },
  ],
  ['missing coverage metrics', { coverage: null }],
]) {
  test(`rejects coverage with ${label}`, () => {
    assert.throws(() =>
      verifyCoverage({ ...evidence(), ...change }, lcov, reference),
    );
    assert.throws(() =>
      verifyCoverage(
        { ...evidence(), runAttempt: '1', ...change },
        lcov,
        reference,
      ),
    );
  });
}

test('accepts valid coverage from an earlier attempt of the same workflow execution', (t) => {
  const fixture = checkout(t);
  write(fixture.coverage, 'analysis.json', {
    ...fixture.metadata,
    runAttempt: '1',
  });
  const { metadata } = prepare(fixture.source, fixture.coverage, fixture.env);
  const result = recordEvidence(
    metadata,
    'success',
    fixture.source,
    fixture.env,
  );
  assert.equal(result.coverageRunAttempt, 1);
  assert.equal(result.runAttempt, '2');
  assert.equal(result.qualityGate, 'PASSED');
  assert.match(
    fs.readFileSync(fixture.env.GITHUB_STEP_SUMMARY, 'utf8'),
    /Coverage producer attempt: 1/,
  );
});

for (const attempt of [
  undefined,
  null,
  false,
  [],
  [1],
  {},
  '',
  '01',
  '1junk',
  0,
  -1,
  1.5,
  '1.5',
  '1e0',
  Number.MAX_SAFE_INTEGER + 1,
  3,
]) {
  test(`rejects invalid or future producing attempt ${JSON.stringify(attempt)}`, () => {
    assert.throws(
      () =>
        verifyCoverage({ ...evidence(), runAttempt: attempt }, lcov, reference),
      /producer attempt/,
    );
    if (attempt !== 3)
      assert.throws(
        () =>
          verifyCoverage(evidence(), lcov, {
            ...reference,
            runAttempt: attempt,
          }),
        /producer attempt/,
      );
  });
}

for (const source of [
  '/home/runner/src/example.ts',
  'C:/src/example.ts',
  'src\\example.ts',
  'src/../src/example.ts',
  'src/./example.ts',
  'src//example.ts',
  'src/../../private.ts',
  'src/example.ts ',
  'src/example\u0000.ts',
  'dist/src/example.js',
  'src/generated/example.ts',
  'src/__generated__/example.ts',
  'src/dist/example.js',
  'src/build/example.js',
  'src/node_modules/example.js',
  'src/example.generated.ts',
  'src/example.spec.ts',
  'src/example.test.js',
  'src/example.d.ts',
  'config/example.js',
  'test/DATA/example.json',
]) {
  test(`rejects invalid LCOV source ${JSON.stringify(source)}`, () => {
    const bytes = Buffer.from(record(source));
    assert.throws(
      () => verifyCoverage(evidence(bytes), bytes, reference),
      /relative original sources/,
    );
  });
}

for (const data of [
  '',
  record().replace('end_of_record\n', ''),
  record().replace('DA:2,0\n', ''),
  record().replace('LF:2', 'LF:3'),
  record().replace('FNF:1', 'FNF:0'),
  record().replace('FNDA:1,first', 'FNDA:1,other'),
  record().replace('BRH:1', 'BRH:2'),
  record().replace('DA:1,1', 'DA:1,invalid'),
  record().replace('DA:1,1', 'DA:0,1'),
  record().replace('DA:1,1', 'DA:1,9007199254740992'),
  record().replace('DA:1,1', 'DA:1,1\nDA:1,1'),
  record().replace('FN:1,first', 'FN:1,first\nFN:1,first'),
  record().replace('BRDA:1,0,0,1', 'BRDA:1,0,0,1\nBRDA:1,0,0,1'),
  record().replace('LF:2', 'LF:2\nLF:2'),
  'DA:1,1\n' + record(),
  record() + record(),
  record() + 'end_of_record\n',
  record() + 'unexpected\n',
]) {
  test('rejects missing, truncated, inconsistent or malformed LCOV with a matching checksum', () => {
    const bytes = Buffer.from(data);
    assert.throws(() => verifyCoverage(evidence(bytes), bytes, reference));
  });
}

test('rejects altered LCOV even when it still contains valid coverage records', () => {
  assert.throws(
    () =>
      verifyCoverage(
        evidence(),
        Buffer.from(record().replace('TN:', 'TN:modified')),
        reference,
      ),
    /altered LCOV/,
  );
});

test('rejects oversized LCOV', () => {
  const bytes = Buffer.alloc(25 * 1024 * 1024);
  assert.throws(
    () => verifyCoverage(evidence(bytes), bytes, reference),
    /oversized/,
  );
});

for (const file of ['analysis.json', 'lcov.info', 'coverage-summary.json']) {
  for (const state of ['missing', 'empty', 'malformed', 'symlink']) {
    test(`rejects ${state} coverage artifact file ${file}`, (t) => {
      const fixture = checkout(t);
      const target = path.join(fixture.coverage, file);
      fs.unlinkSync(target);
      if (state === 'empty') fs.writeFileSync(target, '');
      if (state === 'malformed') fs.writeFileSync(target, 'invalid');
      if (state === 'symlink') {
        const external = path.join(path.dirname(fixture.coverage), 'external');
        fs.writeFileSync(external, PRIVATE);
        fs.symlinkSync(external, target);
      }
      assert.throws(() =>
        prepare(fixture.source, fixture.coverage, fixture.env),
      );
      assert.equal(
        fs.existsSync(path.join(fixture.source, 'reports/coverage/lcov.info')),
        false,
      );
    });
  }
}

test('rejects missing original sources before importing validated coverage', (t) => {
  const fixture = checkout(t);
  fs.unlinkSync(path.join(fixture.source, 'src/example.ts'));
  assert.throws(
    () => prepare(fixture.source, fixture.coverage, fixture.env),
    /missing original sources/,
  );
  assert.equal(
    fs.existsSync(path.join(fixture.source, 'reports/coverage/lcov.info')),
    false,
  );
});

for (const file of [
  'src/example.ts',
  'src/uncovered.ts',
  'config/example.ts',
  'src/nested',
  'config/nested',
  'reports',
  'reports/coverage',
  'sonar-project.properties',
  'tsconfig.sonar.json',
]) {
  test(`rejects symlinked analysis path ${file}`, (t) => {
    const fixture = checkout(t);
    const target = path.join(fixture.source, file);
    const external = path.join(path.dirname(fixture.source), 'external');
    fs.mkdirSync(external);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.symlinkSync(external, target);
    assert.throws(
      () => prepare(fixture.source, fixture.coverage, fixture.env),
      /symlink|real directory/i,
    );
  });
}

test('rejects replaced coverage summaries and impossible coverage metrics', (t) => {
  const fixture = checkout(t);
  const changed = metrics();
  changed.lines.covered = 0;
  changed.lines.pct = 0;
  write(fixture.coverage, 'coverage-summary.json', { total: changed });
  assert.throws(
    () => prepare(fixture.source, fixture.coverage, fixture.env),
    /summary disagrees/,
  );
  for (const metric of [
    { total: -1 },
    { covered: 3 },
    { pct: 200 },
    { skipped: 3 },
    { pct: 10 },
  ]) {
    const invalid = evidence();
    Object.assign(invalid.coverage.lines, metric);
    assert.throws(() => verifyCoverage(invalid, lcov, reference), /statistics/);
  }
});

for (const change of [
  { ANALYSIS_COMMIT: 'b'.repeat(40) },
  { ANALYSIS_COMMIT: '' },
  { GITHUB_REPOSITORY: '' },
  { GITHUB_RUN_ID: '' },
  { GITHUB_RUN_ATTEMPT: '01' },
  { GITHUB_EVENT_NAME: 'pull_request_target' },
  { GITHUB_REF_NAME: 'ENS -Dsonar.host.url=https://other.invalid' },
  { GITHUB_REF_NAME: 'ENS\n-Dsonar.token=secret' },
  { GITHUB_REF: 'refs/tags/ENS' },
]) {
  test('rejects invalid analysis context and scanner argument injection', (t) => {
    const fixture = checkout(t);
    assert.throws(() =>
      prepare(fixture.source, fixture.coverage, { ...fixture.env, ...change }),
    );
  });
}

for (const change of [
  { PR_NUMBER: '' },
  { PR_NUMBER: '7 -Dsonar.token=secret' },
  { GITHUB_BASE_REF: '' },
  { GITHUB_HEAD_REF: 'feature"inject' },
]) {
  test('rejects missing or unsafe pull request context', (t) => {
    const fixture = checkout(t, 'pull_request');
    assert.throws(() =>
      prepare(fixture.source, fixture.coverage, { ...fixture.env, ...change }),
    );
  });
}

for (const [from, to] of [
  ['sonar.organization=soltecsis', 'sonar.organization=other'],
  ['sonar.projectKey=soltecsis_fwcloud-updater', 'sonar.projectKey=other'],
  [
    'sonar.host.url=https://sonarcloud.io',
    'sonar.host.url=https://other.invalid',
  ],
  ['sonar.sources=src,config', 'sonar.sources=.'],
  ['sonar.tests=src', 'sonar.tests=test'],
  ['sonar.test.inclusions=**/*.spec.ts', 'sonar.test.inclusions=**/*.ts'],
  ['**/*.d.ts,', ''],
  [
    'sonar.javascript.lcov.reportPaths=reports/coverage/lcov.info',
    'sonar.javascript.lcov.reportPaths=other.info',
  ],
  ['sonar.qualitygate.wait=true', 'sonar.qualitygate.wait=false'],
  ['sonar.qualitygate.timeout=300', 'sonar.qualitygate.timeout=100'],
  [
    'sonar.typescript.tsconfigPaths=tsconfig.sonar.json',
    'sonar.typescript.tsconfigPaths=tsconfig.json',
  ],
  [
    'sonar.sourceEncoding=UTF-8',
    'sonar.sourceEncoding=UTF-8\nsonar.token=secret',
  ],
  [
    'sonar.qualitygate.wait=true',
    'sonar.qualitygate.wait=true\nsonar.qualitygate.wait=false',
  ],
]) {
  test(`rejects unexpected scanner configuration ${from}`, (t) => {
    const fixture = checkout(t);
    const properties = path.join(fixture.source, 'sonar-project.properties');
    fs.writeFileSync(
      properties,
      fs.readFileSync(properties, 'utf8').replace(from, to),
    );
    assert.throws(() => scannerConfiguration(fixture.source));
  });
}

for (const change of [
  { extends: './tsconfig.json' },
  { compilerOptions: { noEmit: false } },
  { compilerOptions: { noEmit: true, ignoreDeprecations: '6.0' } },
  { include: ['test/**/*.ts'] },
]) {
  test('rejects incompatible or incomplete analysis TypeScript settings', (t) => {
    const fixture = checkout(t);
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(fixture.source, 'tsconfig.sonar.json')),
    );
    write(fixture.source, 'tsconfig.sonar.json', { ...tsconfig, ...change });
    assert.throws(() => scannerConfiguration(fixture.source));
  });
}

test('CLI prepare publishes safe arguments and preserves validated LCOV without dependencies', (t) => {
  const fixture = checkout(t);
  const result = cli(fixture, 'prepare', {}, false);
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(fixture.env.GITHUB_OUTPUT, 'utf8');
  assert.match(
    output,
    /^args=-Dsonar.scm.revision=[a-f0-9]{40} -Dsonar.branch.name=ENS\n$/,
  );
  assert.ok(!output.includes(PRIVATE));
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.source, 'reports/coverage/lcov.info')),
    lcov,
  );
  assert.equal(fs.existsSync(path.join(fixture.source, 'node_modules')), false);
});

for (const scan of ['success', 'failure', 'cancelled', 'skipped', undefined]) {
  test(`records sanitized scanner outcome ${scan} and never claims a false Quality Gate pass`, (t) => {
    const fixture = checkout(t);
    const { metadata } = prepare(fixture.source, fixture.coverage, fixture.env);
    const result = recordEvidence(
      {
        ...metadata,
        token: PRIVATE,
        SONAR_TOKEN: PRIVATE,
        rawLog: PRIVATE,
        task: PRIVATE,
      },
      scan,
      fixture.source,
      fixture.env,
    );
    assert.equal(result.scanOutcome, scan || 'unknown');
    assert.equal(
      result.qualityGate,
      scan === 'success'
        ? 'PASSED'
        : scan === 'skipped'
          ? 'NOT_RUN'
          : 'FAILED_OR_INCOMPLETE',
    );
    const bytes = fs.readFileSync(
      path.join(fixture.source, 'reports/sonar/metadata.json'),
      'utf8',
    );
    assert.ok(!bytes.includes(PRIVATE));
    assert.ok(
      !fs
        .readFileSync(fixture.env.GITHUB_STEP_SUMMARY, 'utf8')
        .includes(PRIVATE),
    );
    assert.equal(
      result.action,
      'SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9',
    );
    assert.equal(result.scannerVersion, '8.1.0.6389');
  });
}

test('scanner success alone cannot pass when validation or download failed', (t) => {
  const fixture = checkout(t);
  const { metadata } = prepare(fixture.source, fixture.coverage, fixture.env);
  for (const change of [
    { ANALYSIS_OUTCOME: 'failure' },
    { DOWNLOAD_OUTCOME: 'failure' },
    { ANALYSIS_OUTCOME: 'skipped' },
  ]) {
    assert.notEqual(
      recordEvidence(metadata, 'success', fixture.source, {
        ...fixture.env,
        ...change,
      }).qualityGate,
      'PASSED',
    );
  }
  assert.notEqual(
    recordEvidence(reference, 'success', fixture.source, {
      ...fixture.env,
      ANALYSIS_OUTCOME: 'success',
    }).qualityGate,
    'PASSED',
  );
});

test('CLI records scanner failure and failed Quality Gate with exact coverage evidence', (t) => {
  const fixture = checkout(t);
  assert.equal(cli(fixture, 'prepare').status, 0);
  const result = cli(fixture, 'record', {
    ANALYSIS_OUTCOME: 'success',
    DOWNLOAD_OUTCOME: 'success',
    SCAN_OUTCOME: 'failure',
  });
  assert.equal(result.status, 1);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(fixture.source, 'reports/sonar/metadata.json')),
  );
  assert.equal(metadata.qualityGate, 'FAILED_OR_INCOMPLETE');
  assert.equal(metadata.coverageReportSha256, digest(lcov));
  assert.equal(metadata.commit, fixture.env.ANALYSIS_COMMIT);
  assert.equal(metadata.coverageRunAttempt, 2);
  assert.ok(!JSON.stringify(metadata).includes(PRIVATE));
});

test('CLI records successful scanner execution and the blocking Quality Gate pass', (t) => {
  const fixture = checkout(t);
  assert.equal(cli(fixture, 'prepare').status, 0);
  const result = cli(fixture, 'record', {
    ANALYSIS_OUTCOME: 'success',
    DOWNLOAD_OUTCOME: 'success',
    SCAN_OUTCOME: 'success',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(fixture.source, 'reports/sonar/metadata.json')),
    ).qualityGate,
    'PASSED',
  );
});

test('CLI emits sanitized evidence when preparation or coverage download fails', (t) => {
  const fixture = checkout(t);
  write(fixture.coverage, 'analysis.json', `${PRIVATE} malformed`);
  assert.equal(cli(fixture, 'prepare').status, 1);
  const result = cli(fixture, 'record', {
    ANALYSIS_OUTCOME: 'failure',
    DOWNLOAD_OUTCOME: 'success',
    SCAN_OUTCOME: 'skipped',
  });
  assert.equal(result.status, 1);
  const target = path.join(fixture.source, 'reports/sonar/metadata.json');
  let metadata = JSON.parse(fs.readFileSync(target));
  assert.equal(metadata.validationOutcome, 'failure');
  assert.equal(metadata.qualityGate, 'NOT_RUN');
  assert.equal(metadata.commit, fixture.env.ANALYSIS_COMMIT);
  assert.ok(!JSON.stringify(metadata).includes(PRIVATE));
  fs.unlinkSync(target);
  assert.equal(
    cli(fixture, 'record', {
      ANALYSIS_OUTCOME: 'skipped',
      DOWNLOAD_OUTCOME: 'failure',
      SCAN_OUTCOME: 'skipped',
    }).status,
    1,
  );
  metadata = JSON.parse(fs.readFileSync(target));
  assert.equal(metadata.downloadOutcome, 'failure');
  assert.equal(metadata.validationOutcome, 'failure');
});

test('CLI refuses unrelated or stale preparation metadata even with scanner success', (t) => {
  const fixture = checkout(t);
  assert.equal(cli(fixture, 'prepare').status, 0);
  const file = path.join(fixture.source, 'reports/sonar/metadata.json');
  const valid = JSON.parse(fs.readFileSync(file));
  for (const change of [
    { commit: 'b'.repeat(40) },
    { runId: '5678' },
    { runAttempt: '1' },
    { repository: 'fork/updater' },
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...valid, ...change }));
    assert.equal(
      cli(fixture, 'record', {
        ANALYSIS_OUTCOME: 'success',
        DOWNLOAD_OUTCOME: 'success',
        SCAN_OUTCOME: 'success',
      }).status,
      1,
    );
  }
});
