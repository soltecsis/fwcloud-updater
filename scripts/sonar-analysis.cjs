// Validate the existing Node 22 coverage artifact; never run Jest or install
// dependencies here. Only allowlisted execution aggregates become evidence.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { context, writeJson } = require('./ci-context.cjs');

const LCOV = 'reports/coverage/lcov.info';
const EVIDENCE = 'reports/sonar/metadata.json';
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const COUNTERS = [
  'numTotalTestSuites',
  'numFailedTestSuites',
  'numTotalTests',
  'numPassedTests',
  'numFailedTests',
  'numPendingTests',
  'numTodoTests',
  'executed',
];
const ACTION =
  'SonarSource/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9';
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const identifier = (value) =>
  ['number', 'string'].includes(typeof value) &&
  /^[1-9]\d*$/.test(String(value)) &&
  Number.isSafeInteger(Number(value));
const branch = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,199}$/.test(value);
const hash = (value, length) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const outcome = (value) =>
  ['success', 'failure', 'cancelled', 'skipped'].includes(value)
    ? value
    : 'unknown';

function realPath(root, relative, create = false) {
  const resolved = path.resolve(root);
  must(
    fs.lstatSync(resolved).isDirectory(),
    'Report/source root must be a real directory.',
  );
  let current = resolved;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && create) continue;
    must(stat && !stat.isSymbolicLink(), 'Missing file or unexpected symlink.');
  }
  return current;
}

function read(root, relative, limit = 25 * 1024 * 1024) {
  const file = realPath(root, relative);
  const stat = fs.lstatSync(file);
  must(
    stat.isFile() && stat.size > 0 && stat.size < limit,
    'Missing, empty or oversized evidence file.',
  );
  return fs.readFileSync(file);
}

function json(root, relative) {
  const bytes = read(root, relative);
  try {
    return JSON.parse(bytes);
  } catch {
    throw new Error('Malformed JSON evidence.');
  }
}

function coverageMetrics(value) {
  must(value && typeof value === 'object', 'Missing coverage statistics.');
  const result = {};
  for (const key of METRICS) {
    const metric = value[key];
    must(
      integer(metric?.total) &&
        integer(metric.covered) &&
        integer(metric.skipped) &&
        metric.covered <= metric.total &&
        metric.skipped <= metric.total &&
        Number.isFinite(metric.pct) &&
        metric.pct >= 0 &&
        metric.pct <= 100 &&
        Math.abs(
          metric.pct -
            (metric.total ? (metric.covered / metric.total) * 100 : 100),
        ) <= 0.011,
      'Invalid coverage statistics.',
    );
    result[key] = Object.fromEntries(
      ['total', 'covered', 'skipped', 'pct'].map((name) => [
        name,
        metric[name],
      ]),
    );
  }
  must(result.lines.total > 0, 'Coverage contains no source lines.');
  return result;
}

function originalSource(file) {
  return (
    /^(src\/.+\.(ts|js)|config\/.+\.ts)$/.test(file) &&
    !/[\x00-\x20\x7f\\]/.test(file) &&
    !file
      .split('/')
      .some((part) =>
        [
          '',
          '.',
          '..',
          'dist',
          'build',
          'generated',
          '__generated__',
          'node_modules',
          'reports',
          'coverage',
        ].includes(part),
      ) &&
    !/\.(d\.ts|(?:spec|test|generated)\.(ts|js))$/.test(file)
  );
}

function validateLcov(bytes, coverage) {
  const totals = { LF: 0, LH: 0, FNF: 0, FNH: 0, BRF: 0, BRH: 0 };
  const sources = new Set();
  let record = null;
  const check = (condition) =>
    must(condition, 'Invalid or incomplete LCOV source coverage.');
  for (const line of bytes.toString('utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      const source = line.slice(3);
      must(
        originalSource(source),
        'LCOV must reference relative original sources only.',
      );
      check(!record && !sources.has(source));
      sources.add(source);
      record = {
        counts: {},
        lines: new Map(),
        functions: new Map(),
        definitions: new Set(),
        branches: new Map(),
      };
    } else if (line === 'end_of_record') {
      check(record);
      const { counts, lines, functions, definitions, branches } = record;
      check(
        definitions.size === functions.size &&
          [...definitions].every((name) => functions.has(name)),
      );
      const expected = {
        LF: lines.size,
        LH: [...lines.values()].filter((hits) => hits > 0).length,
        FNF: definitions.size,
        FNH: [...functions.values()].filter((hits) => hits > 0).length,
        BRF: branches.size,
        BRH: [...branches.values()].filter((hits) => hits > 0).length,
      };
      for (const key of Object.keys(totals)) {
        check(counts[key] === expected[key]);
        totals[key] += counts[key];
      }
      record = null;
    } else if (/^(LF|LH|FNF|FNH|BRF|BRH):/.test(line)) {
      const [key, value] = line.split(':');
      check(
        record &&
          /^\d+$/.test(value) &&
          integer(Number(value)) &&
          !(key in record.counts),
      );
      record.counts[key] = Number(value);
    } else if (line.startsWith('DA:')) {
      const match = /^DA:([1-9]\d*),(\d+)(?:,[^,]+)?$/.exec(line);
      check(
        record &&
          match &&
          identifier(match[1]) &&
          integer(Number(match[2])) &&
          !record.lines.has(match[1]),
      );
      record.lines.set(match[1], Number(match[2]));
    } else if (line.startsWith('FNDA:')) {
      const match = /^FNDA:(\d+),(.+)$/.exec(line);
      check(
        record &&
          match &&
          integer(Number(match[1])) &&
          !record.functions.has(match[2]),
      );
      record.functions.set(match[2], Number(match[1]));
    } else if (line.startsWith('FN:')) {
      const match = /^FN:(\d+),(.+)$/.exec(line);
      check(
        record &&
          match &&
          integer(Number(match[1])) &&
          !record.definitions.has(match[2]),
      );
      record.definitions.add(match[2]);
    } else if (line.startsWith('BRDA:')) {
      const match = /^BRDA:(\d+,\d+,\d+),(-|\d+)$/.exec(line);
      check(
        record &&
          match &&
          !record.branches.has(match[1]) &&
          (match[2] === '-' || integer(Number(match[2]))),
      );
      record.branches.set(match[1], match[2] === '-' ? 0 : Number(match[2]));
    } else check(!line || line.startsWith('TN:'));
  }
  check(!record && sources.size > 0);
  for (const [key, found, hit] of [
    ['lines', 'LF', 'LH'],
    ['functions', 'FNF', 'FNH'],
    ['branches', 'BRF', 'BRH'],
  ]) {
    check(
      totals[found] === coverage[key].total &&
        totals[hit] === coverage[key].covered,
    );
  }
  return [...sources];
}

function verifyCoverage(
  metadata,
  lcov,
  run,
  summary = { total: metadata?.coverage },
) {
  must(
    metadata?.schemaVersion === 1 &&
      metadata.repository === run.repository &&
      metadata.commit === run.commit &&
      metadata.event === run.event &&
      String(metadata.runId) === String(run.runId),
    'Coverage does not belong to this CI revision/execution.',
  );
  must(
    identifier(metadata.runAttempt) &&
      identifier(run.runAttempt) &&
      Number(metadata.runAttempt) <= Number(run.runAttempt),
    'Coverage producer attempt is invalid or newer than this analysis.',
  );
  const tests = metadata.tests;
  must(
    metadata.testOutcome === 'success' &&
      metadata.coverageExpected === true &&
      /^v22\.\d+\.\d+$/.test(metadata.node) &&
      tests?.success === true &&
      COUNTERS.every((key) => integer(tests[key])) &&
      tests.numTotalTestSuites > 0 &&
      tests.numFailedTestSuites === 0 &&
      tests.numFailedTests === 0 &&
      tests.executed > 0 &&
      tests.executed === tests.numPassedTests &&
      tests.numTotalTests ===
        tests.numPassedTests + tests.numPendingTests + tests.numTodoTests &&
      Array.isArray(metadata.errors) &&
      metadata.errors.length === 0,
    'Node 22 Jest evidence is incomplete or failed.',
  );
  must(
    Buffer.isBuffer(lcov) &&
      lcov.length > 0 &&
      lcov.length < 25 * 1024 * 1024 &&
      metadata.lcov?.path === LCOV &&
      hash(metadata.lcov.sha256, 64) &&
      metadata.lcov.sha256 === digest(lcov),
    'Missing, oversized or altered LCOV.',
  );
  const coverage = coverageMetrics(metadata.coverage);
  must(
    JSON.stringify(coverage) ===
      JSON.stringify(coverageMetrics(summary?.total)),
    'Coverage summary disagrees with its producing evidence.',
  );
  return validateLcov(lcov, coverage);
}

function scannerConfiguration(source) {
  const bytes = read(source, 'sonar-project.properties', 64 * 1024);
  const settings = {};
  for (const text of bytes.toString('utf8').split(/\r?\n/)) {
    const line = text.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const match = /^([A-Za-z][A-Za-z0-9.]*)=(\S+)$/.exec(line);
    must(
      match && !Object.hasOwn(settings, match[1]),
      'Invalid or duplicate scanner setting.',
    );
    settings[match[1]] = match[2];
  }
  const required = {
    'sonar.organization': 'soltecsis',
    'sonar.projectKey': 'soltecsis_fwcloud-updater',
    'sonar.host.url': 'https://sonarcloud.io',
    'sonar.sources': 'src,config',
    'sonar.tests': 'src',
    'sonar.test.inclusions': '**/*.spec.ts',
    'sonar.javascript.lcov.reportPaths': LCOV,
    'sonar.sourceEncoding': 'UTF-8',
    'sonar.qualitygate.wait': 'true',
    'sonar.qualitygate.timeout': '300',
    'sonar.typescript.tsconfigPaths': 'tsconfig.sonar.json',
    'sonar.scm.exclusions.disabled': 'true',
  };
  for (const [key, value] of Object.entries(required))
    must(settings[key] === value, 'Unexpected scanner configuration.');
  const exclusions = (settings['sonar.exclusions'] || '').split(',');
  const requiredExclusions = [
    '**/*.spec.ts',
    '**/*.spec.js',
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.d.ts',
    '**/generated/**',
    '**/__generated__/**',
    '**/*.generated.ts',
    '**/*.generated.js',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
    '**/reports/**',
    '**/coverage/**',
    'test/**',
  ];
  must(
    exclusions.length === requiredExclusions.length &&
      requiredExclusions.every((pattern) => exclusions.includes(pattern)),
    'Scanner source exclusions must match the validated source scope.',
  );
  const testExclusions = (settings['sonar.test.exclusions'] || '').split(',');
  const requiredTestExclusions = [
    '**/generated/**',
    '**/__generated__/**',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
    '**/reports/**',
    '**/coverage/**',
  ];
  must(
    testExclusions.length === requiredTestExclusions.length &&
      requiredTestExclusions.every((pattern) =>
        testExclusions.includes(pattern),
      ),
    'Scanner test exclusions must preserve specification indexing.',
  );
  must(
    Object.keys(settings).every(
      (key) =>
        key in required ||
        ['sonar.exclusions', 'sonar.test.exclusions'].includes(key),
    ),
    'Unsupported scanner configuration override.',
  );
  const tsconfigBytes = read(source, 'tsconfig.sonar.json', 64 * 1024);
  const tsconfig = json(source, 'tsconfig.sonar.json');
  must(
    !tsconfig.extends &&
      !tsconfig.references &&
      !tsconfig.files &&
      tsconfig.compilerOptions?.noEmit === true &&
      !tsconfig.compilerOptions.ignoreDeprecations &&
      !tsconfig.compilerOptions.baseUrl,
    'Sonar TypeScript configuration must be standalone and compatible.',
  );
  must(
    Array.isArray(tsconfig.include) &&
      tsconfig.include.length === 2 &&
      tsconfig.include.includes('src/**/*') &&
      tsconfig.include.includes('config/**/*.ts'),
    'Sonar TypeScript configuration must include only the analyzed sources.',
  );
  const tsExclusions = [
    'node_modules',
    'dist',
    'build',
    'reports',
    'coverage',
    'test',
    '**/generated/**',
    '**/__generated__/**',
    '**/*.generated.ts',
    '**/*.generated.js',
  ];
  must(
    Array.isArray(tsconfig.exclude) &&
      tsconfig.exclude.length === tsExclusions.length &&
      tsExclusions.every((pattern) => tsconfig.exclude.includes(pattern)),
    'Sonar TypeScript exclusions must preserve the analyzed source scope.',
  );
  return {
    settings,
    scannerSettingsSha256: digest(bytes),
    tsconfigSha256: digest(tsconfigBytes),
  };
}

function analysisContext(source, env) {
  const ci = context(source, env);
  must(
    hash(env.ANALYSIS_COMMIT, 40) && ci.commit === env.ANALYSIS_COMMIT,
    'Checkout differs from the tested revision.',
  );
  must(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ci.repository || '') &&
      identifier(ci.runId) &&
      identifier(ci.runAttempt),
    'Incomplete CI execution context.',
  );
  must(
    ['push', 'pull_request', 'workflow_dispatch'].includes(ci.event),
    'Unsupported analysis event.',
  );
  const run = {
    ...ci,
    branch:
      ci.event === 'pull_request' ? env.GITHUB_HEAD_REF : env.GITHUB_REF_NAME,
    base: null,
    pr: null,
  };
  must(branch(run.branch), 'Invalid source branch.');
  if (ci.event === 'pull_request') {
    must(
      identifier(env.PR_NUMBER) && branch(env.GITHUB_BASE_REF),
      'Invalid pull request context.',
    );
    run.pr = Number(env.PR_NUMBER);
    run.base = env.GITHUB_BASE_REF;
  } else
    must(
      env.GITHUB_REF === `refs/heads/${run.branch}`,
      'Analysis requires a branch reference.',
    );
  return run;
}

function prepare(source, coverage, env = process.env) {
  const run = analysisContext(source, env);
  const config = scannerConfiguration(source);
  const producer = json(coverage, 'analysis.json');
  const lcov = read(coverage, 'lcov.info');
  const files = verifyCoverage(
    producer,
    lcov,
    run,
    json(coverage, 'coverage-summary.json'),
  );
  const walk = (directory) => {
    must(
      fs.lstatSync(directory).isDirectory(),
      'Analyzed source directory must be a real directory.',
    );
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      must(
        !entry.isSymbolicLink(),
        'Symlinks are not allowed in analyzed source trees.',
      );
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
      else
        must(
          entry.isFile(),
          'Unexpected special file in analyzed source trees.',
        );
    }
  };
  walk(path.join(source, 'src'));
  walk(path.join(source, 'config'));
  must(
    files.every((file) =>
      fs
        .lstatSync(path.join(source, file), { throwIfNoEntry: false })
        ?.isFile(),
    ),
    'LCOV references missing original sources.',
  );
  const target = realPath(source, LCOV, true);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lcov);
  const args = [`-Dsonar.scm.revision=${run.commit}`];
  if (run.pr)
    args.push(
      `-Dsonar.pullrequest.key=${run.pr}`,
      `-Dsonar.pullrequest.branch=${run.branch}`,
      `-Dsonar.pullrequest.base=${run.base}`,
    );
  else args.push(`-Dsonar.branch.name=${run.branch}`);
  return {
    metadata: {
      ...run,
      organization: config.settings['sonar.organization'],
      projectKey: config.settings['sonar.projectKey'],
      coverageRunAttempt: Number(producer.runAttempt),
      coverageReportSha256: digest(lcov),
      coverageNode: producer.node,
      coverageArtifact: `updater-coverage-node22-${run.runId}`,
      scannerSettingsSha256: config.scannerSettingsSha256,
      tsconfigSha256: config.tsconfigSha256,
      sourceCount: files.length,
      validationOutcome: 'success',
    },
    args: args.join(' '),
  };
}

function sanitized(run) {
  const result = { schemaVersion: 1 };
  const validators = {
    repository: (value) =>
      typeof value === 'string' &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value),
    commit: (value) => hash(value, 40),
    event: (value) =>
      ['push', 'pull_request', 'workflow_dispatch'].includes(value),
    ref: (value) =>
      typeof value === 'string' &&
      /^refs\/(heads|pull)\/[A-Za-z0-9/_.-]{1,200}$/.test(value),
    runId: identifier,
    runAttempt: identifier,
    branch,
    base: branch,
    pr: identifier,
    organization: (value) => value === 'soltecsis',
    projectKey: (value) => value === 'soltecsis_fwcloud-updater',
    coverageRunAttempt: identifier,
    coverageReportSha256: (value) => hash(value, 64),
    coverageNode: (value) =>
      typeof value === 'string' && /^v22\.\d+\.\d+$/.test(value),
    coverageArtifact: (value) =>
      value === `updater-coverage-node22-${run?.runId}`,
    scannerSettingsSha256: (value) => hash(value, 64),
    tsconfigSha256: (value) => hash(value, 64),
    sourceCount: (value) => integer(value) && value > 0,
  };
  for (const [key, valid] of Object.entries(validators)) {
    const value = run?.[key];
    result[key] = valid(value) ? value : null;
  }
  return result;
}

function recordEvidence(run, scanOutcome, source = '.', env = process.env) {
  const result = sanitized(run);
  result.analyzedAt = new Date().toISOString();
  result.validationOutcome = outcome(
    env.ANALYSIS_OUTCOME || env.VALIDATION_OUTCOME || run.validationOutcome,
  );
  result.downloadOutcome = outcome(env.DOWNLOAD_OUTCOME || 'success');
  result.scanOutcome = outcome(scanOutcome);
  const success =
    result.validationOutcome === 'success' &&
    result.downloadOutcome === 'success' &&
    result.scanOutcome === 'success' &&
    run.validationOutcome === 'success' &&
    result.coverageRunAttempt !== null &&
    result.coverageReportSha256 !== null &&
    result.scannerSettingsSha256 !== null &&
    result.tsconfigSha256 !== null;
  result.qualityGate = success
    ? 'PASSED'
    : result.scanOutcome === 'skipped'
      ? 'NOT_RUN'
      : 'FAILED_OR_INCOMPLETE';
  result.action = ACTION;
  result.scannerVersion = '8.1.0.6389';
  realPath(source, EVIDENCE, true);
  writeJson(path.join(source, EVIDENCE), result);
  const summary = `## SonarQube analysis\n\nRevision: \`${result.commit || 'unavailable'}\`\n\nCI: ${result.runId || 'unavailable'}/${result.runAttempt || 'unavailable'}\n\nCoverage producer attempt: ${result.coverageRunAttempt || 'unavailable'}\n\nCoverage validation: **${result.validationOutcome}**\n\nScanner: **${result.scanOutcome}**\n\nQuality Gate: **${result.qualityGate}**\n`;
  if (env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trimEnd());
  return result;
}

function fallback(source, env) {
  let run = {};
  try {
    run = analysisContext(source, env);
  } catch {
    try {
      run = context(source, { ...env, ANALYSIS_COMMIT: '' });
    } catch {
      /* No checkout context is available. */
    }
  }
  return sanitized(run);
}

function main(env = process.env) {
  const source = '.';
  if (process.argv[2] === 'prepare') {
    try {
      const result = prepare(
        source,
        process.argv[3] || env.COVERAGE_DIRECTORY || 'reports/coverage',
        env,
      );
      realPath(source, EVIDENCE, true);
      writeJson(EVIDENCE, result.metadata);
      if (env.GITHUB_OUTPUT)
        fs.appendFileSync(env.GITHUB_OUTPUT, `args=${result.args}\n`);
      console.log(result.args);
    } catch {
      recordEvidence(
        { ...fallback(source, env), validationOutcome: 'failure' },
        'skipped',
        source,
        { ...env, ANALYSIS_OUTCOME: 'failure' },
      );
      console.error(
        'SonarQube preparation failed: checkout, coverage or scanner configuration is invalid.',
      );
      process.exitCode = 1;
    }
  } else if (process.argv[2] === 'record') {
    let run = fallback(source, env);
    let prepared = false;
    try {
      const saved = json(source, EVIDENCE);
      if (
        saved.validationOutcome === 'success' &&
        saved.commit === run.commit &&
        saved.repository === run.repository &&
        String(saved.runId) === String(run.runId) &&
        String(saved.runAttempt) === String(run.runAttempt)
      ) {
        run = saved;
        prepared = true;
      }
    } catch {
      /* Download or validation may have failed before preparing metadata. */
    }
    const result = recordEvidence(run, env.SCAN_OUTCOME, source, {
      ...env,
      ANALYSIS_OUTCOME: prepared
        ? env.ANALYSIS_OUTCOME || env.VALIDATION_OUTCOME || 'success'
        : 'failure',
    });
    if (result.qualityGate !== 'PASSED') process.exitCode = 1;
  } else {
    console.error(
      'Usage: node scripts/sonar-analysis.cjs prepare [coverage-directory] | record',
    );
    process.exitCode = 1;
  }
}

module.exports = {
  verifyCoverage,
  prepare,
  recordEvidence,
  scannerConfiguration,
};
if (require.main === module) main();
