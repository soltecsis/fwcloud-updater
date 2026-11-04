// Adapted from FWCloud Websrv's Jest validator and FWCloud API's evidence
// context. Only validated aggregates are copied to the Actions summary.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SaxesParser } = require('saxes');
const { context, writeJson, summary } = require('./ci-context.cjs');

const JUNIT = 'reports/tests/junit.xml';
const RESULTS = 'reports/tests/results.json';
const LCOV = 'reports/coverage/lcov.info';
const ANALYSIS = 'reports/coverage/analysis.json';
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const COUNTERS = [
  'numTotalTestSuites',
  'numFailedTestSuites',
  'numTotalTests',
  'numPassedTests',
  'numFailedTests',
  'numPendingTests',
  'numTodoTests',
];
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

function readReport(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Missing or empty report: ${file}`);
  }
  const bytes = fs.readFileSync(file);
  if (!bytes.toString('utf8').trim()) {
    throw new Error(`Missing or empty report: ${file}`);
  }
  return bytes;
}

function readJson(file) {
  const bytes = readReport(file);
  try {
    return JSON.parse(bytes);
  } catch {
    throw new Error(`Invalid JSON report: ${file}`);
  }
}

function junitStatistics() {
  const text = readReport(JUNIT).toString('utf8');
  const totals = { tests: 0, failures: 0, errors: 0, skipped: 0 };
  const parser = new SaxesParser();
  const stack = [];
  let suites = 0;
  let cases = 0;
  let skipped = 0;
  try {
    parser.on('doctype', () => {
      throw new Error('Unexpected doctype');
    });
    parser.on('opentag', ({ name, attributes }) => {
      const parent = stack.at(-1);
      if (stack.length === 0 && name !== 'testsuites') {
        throw new Error('Unexpected root');
      }
      if (name === 'testsuite') {
        if (parent !== 'testsuites') throw new Error('Unexpected suite');
        suites++;
        for (const key of Object.keys(totals)) {
          const value = attributes[key];
          if (!/^\d+$/.test(value) || !integer(Number(value))) {
            throw new Error('Invalid suite counter');
          }
          totals[key] += Number(value);
        }
      }
      if (name === 'testcase') {
        if (parent !== 'testsuite') throw new Error('Unexpected testcase');
        cases++;
      }
      if (name === 'skipped') {
        if (parent !== 'testcase') throw new Error('Unexpected skipped result');
        skipped++;
      }
      // Detect failure elements even when the declared counters are wrong.
      if (name === 'failure' || name === 'error') {
        throw new Error('JUnit failures reported');
      }
      stack.push(name);
    });
    parser.on('closetag', () => stack.pop());
    parser.write(text).close();
    // jest-junit 17 includes todo testcases but omits them from tests/skipped.
    if (
      suites === 0 ||
      cases === 0 ||
      totals.tests > cases ||
      totals.skipped !== skipped
    ) {
      throw new Error('Incomplete testcases');
    }
  } catch {
    throw new Error(`Invalid or failed JUnit report: ${JUNIT}`);
  }
  if (totals.failures || totals.errors) {
    throw new Error('JUnit failures reported.');
  }
  return { ...totals, cases };
}

function jestStatistics(results) {
  for (const key of COUNTERS) {
    if (!integer(results?.[key])) {
      throw new Error(`Invalid test counter: ${key}`);
    }
  }
  if (
    results.numTotalTests !==
      results.numPassedTests +
        results.numFailedTests +
        results.numPendingTests +
        results.numTodoTests ||
    results.numFailedTestSuites > results.numTotalTestSuites
  ) {
    throw new Error('Inconsistent Jest counters.');
  }
  if (
    !Number.isFinite(results.startTime) ||
    results.startTime <= 0 ||
    !Array.isArray(results.testResults) ||
    results.testResults.length !== results.numTotalTestSuites ||
    results.testResults.some(
      (suite) =>
        !Number.isFinite(suite.startTime) ||
        !Number.isFinite(suite.endTime) ||
        suite.endTime < suite.startTime,
    )
  ) {
    throw new Error('Invalid Jest timing or suite results.');
  }
  const endTime = Math.max(
    results.startTime,
    ...results.testResults.map((suite) => suite.endTime),
  );
  return {
    ...Object.fromEntries(COUNTERS.map((key) => [key, results[key]])),
    executed: results.numPassedTests + results.numFailedTests,
    success: results.success === true,
    startTime: results.startTime,
    durationMs: endTime - results.startTime,
  };
}

function coverageStatistics() {
  const { total } = readJson('reports/coverage/coverage-summary.json') || {};
  const metrics = {};
  for (const key of METRICS) {
    const metric = total?.[key];
    if (
      !integer(metric?.total) ||
      !integer(metric.covered) ||
      !integer(metric.skipped) ||
      metric.covered > metric.total ||
      metric.skipped > metric.total ||
      !Number.isFinite(metric.pct) ||
      metric.pct < 0 ||
      metric.pct > 100 ||
      Math.abs(
        metric.pct -
          (metric.total ? (metric.covered / metric.total) * 100 : 100),
      ) > 0.011
    ) {
      throw new Error(`Invalid coverage metric: ${key}`);
    }
    metrics[key] = metric;
  }
  if (metrics.lines.total === 0) {
    throw new Error('Coverage contains no source lines.');
  }
  const html = readReport('reports/coverage/index.html').toString('utf8');
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error('Invalid HTML coverage report.');
  }
  return metrics;
}

function validateLcov(bytes, coverage) {
  const totals = { LF: 0, LH: 0, FNF: 0, FNH: 0, BRF: 0, BRH: 0 };
  const sources = new Set();
  let record = null;
  const invalid = () => {
    throw new Error(`Invalid LCOV report: ${LCOV}`);
  };
  for (const line of bytes.toString('utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      if (record) invalid();
      const source = path
        .relative('.', path.resolve(line.slice(3)))
        .replaceAll('\\', '/');
      if (
        !/^(src\/.+\.(ts|js)|config\/.+\.ts)$/.test(source) ||
        /\.(d\.ts|(?:spec|test)\.(ts|js))$/.test(source) ||
        sources.has(source)
      )
        invalid();
      sources.add(source);
      record = {
        counts: {},
        lines: new Map(),
        functions: new Map(),
        branches: new Map(),
        definitions: 0,
      };
    } else if (line === 'end_of_record') {
      if (!record) invalid();
      const { counts, lines, functions, branches, definitions } = record;
      const expected = {
        LF: lines.size,
        LH: [...lines.values()].filter((hits) => hits > 0).length,
        FNF: definitions,
        FNH: [...functions.values()].filter((hits) => hits > 0).length,
        BRF: branches.size,
        BRH: [...branches.values()].filter((hits) => hits > 0).length,
      };
      if (definitions !== functions.size) invalid();
      for (const key of Object.keys(totals)) {
        if (counts[key] !== expected[key]) invalid();
        totals[key] += counts[key];
      }
      record = null;
    } else if (/^(LF|LH|FNF|FNH|BRF|BRH):/.test(line)) {
      const [key, value] = line.split(':');
      if (
        !record ||
        !/^\d+$/.test(value) ||
        !integer(Number(value)) ||
        key in record.counts
      )
        invalid();
      record.counts[key] = Number(value);
    } else if (line.startsWith('DA:')) {
      const match = /^DA:([1-9]\d*),(\d+)(?:,[^,]+)?$/.exec(line);
      if (
        !record ||
        !match ||
        !integer(Number(match[2])) ||
        record.lines.has(match[1])
      )
        invalid();
      record.lines.set(match[1], Number(match[2]));
    } else if (line.startsWith('FNDA:')) {
      const match = /^FNDA:(\d+),(.+)$/.exec(line);
      if (
        !record ||
        !match ||
        !integer(Number(match[1])) ||
        record.functions.has(match[2])
      )
        invalid();
      record.functions.set(match[2], Number(match[1]));
    } else if (line.startsWith('FN:')) {
      if (!record || !/^FN:\d+,.+$/.test(line)) invalid();
      record.definitions++;
    } else if (line.startsWith('BRDA:')) {
      const match = /^BRDA:(\d+,\d+,\d+),(-|\d+)$/.exec(line);
      if (
        !record ||
        !match ||
        record.branches.has(match[1]) ||
        (match[2] !== '-' && !integer(Number(match[2])))
      )
        invalid();
      record.branches.set(match[1], match[2] === '-' ? 0 : Number(match[2]));
    } else if (line && !line.startsWith('TN:')) {
      invalid();
    }
  }
  if (record || sources.size === 0) invalid();
  for (const [key, found, hit] of [
    ['lines', 'LF', 'LH'],
    ['functions', 'FNF', 'FNH'],
    ['branches', 'BRF', 'BRH'],
  ]) {
    if (
      totals[found] !== coverage[key].total ||
      totals[hit] !== coverage[key].covered
    )
      invalid();
  }
}

const env = process.env;
const errors = [];
let evidence = {
  schemaVersion: 1,
  collectedAt: new Date().toISOString(),
  commit: null,
};
try {
  // Preserve the actual checkout in metadata even if ANALYSIS_COMMIT disagrees.
  evidence = context('.', { ...env, ANALYSIS_COMMIT: '' });
  context();
} catch {
  errors.push('Cannot verify the checked-out analysis commit.');
}
let npm = null;
try {
  npm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
} catch {
  errors.push('Cannot determine npm version.');
}
const metadata = {
  ...evidence,
  node: process.version,
  npm,
  testOutcome: env.TEST_OUTCOME || 'unknown',
  coverageExpected: env.COVERAGE_EXPECTED === 'true',
  tests: null,
  coverage: null,
  errors,
};

fs.rmSync(ANALYSIS, { force: true });
let junit = null;
try {
  junit = junitStatistics();
} catch (error) {
  errors.push(error.message);
}
try {
  const results = readJson(RESULTS);
  metadata.tests = jestStatistics(results);
  if (metadata.tests.executed === 0) errors.push('No tests executed.');
  if (
    !metadata.tests.success ||
    results.numFailedTests ||
    results.numFailedTestSuites
  ) {
    errors.push('Test failures reported.');
  }
  if (
    junit &&
    (junit.cases !== results.numTotalTests ||
      junit.tests !== results.numTotalTests - results.numTodoTests ||
      junit.skipped !== results.numPendingTests)
  )
    errors.push('JUnit and Jest statistics disagree.');
} catch (error) {
  errors.push(error.message);
}
let lcov = null;
if (metadata.coverageExpected) {
  try {
    const coverage = coverageStatistics();
    lcov = readReport(LCOV);
    validateLcov(lcov, coverage);
    metadata.coverage = coverage;
  } catch (error) {
    errors.push(error.message);
  }
}
if (metadata.testOutcome !== 'success')
  errors.push('Test step did not succeed.');
writeJson('reports/metadata.json', metadata);
if (metadata.coverageExpected && errors.length === 0) {
  writeJson(ANALYSIS, {
    ...metadata,
    lcov: {
      path: LCOV,
      sha256: crypto.createHash('sha256').update(lcov).digest('hex'),
    },
  });
}

const lines = [
  `## Updater test reports (Node.js ${process.version})`,
  '',
  `Reports: **${errors.length ? 'FAILED / INCOMPLETE' : 'COMPLETE'}**`,
];
if (metadata.tests) {
  const t = metadata.tests;
  lines.push(
    '',
    '| Suites | Failed suites | Tests | Executed | Passed | Failed | Skipped | Todo | Duration (ms) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${t.numTotalTestSuites} | ${t.numFailedTestSuites} | ${t.numTotalTests} | ${t.executed} | ${t.numPassedTests} | ${t.numFailedTests} | ${t.numPendingTests} | ${t.numTodoTests} | ${t.durationMs} |`,
  );
}
if (metadata.coverage) {
  lines.push('', '| Coverage | % |', '| --- | --- |');
  for (const key of METRICS)
    lines.push(`| ${key} | ${metadata.coverage[key].pct} |`);
}
if (errors.length)
  lines.push(
    '',
    'See the test step and metadata artifact for failure details.',
  );
summary(lines);
if (errors.length) process.exitCode = 1;
