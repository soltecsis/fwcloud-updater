// Adapted from FWCloud API's Gitleaks collector. Only the scan context,
// aggregate counts and validated rule identifiers leave the detailed report.
const fs = require('node:fs');
const {
  context,
  writeJson,
  summary: publishSummary,
  exitCode: parseCount,
} = require('./ci-context.cjs');

const env = process.env;
const reportPath = env.GITLEAKS_REPORT_PATH || 'reports/secrets/gitleaks.json';
const metadataPath =
  env.GITLEAKS_METADATA_PATH || 'reports/secrets/metadata.json';
const RULE_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
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

// JSON.parse quotes short invalid input, so its message is never recorded.
let findings = null;
try {
  const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(parsed)) throw new TypeError();
  findings = parsed;
} catch (error) {
  errors.push(
    error.code === 'ENOENT'
      ? 'Gitleaks report is missing.'
      : 'Gitleaks report is unreadable or not a JSON array.',
  );
}

// Rule ids are the only finding detail published. Every default rule id of
// Gitleaks 8.30.1 matches RULE_ID.
const ruleIds = new Set();
let invalidFindings = 0;
for (const finding of findings ?? []) {
  const rule = finding?.RuleID;
  if (typeof rule === 'string' && RULE_ID.test(rule)) ruleIds.add(rule);
  else invalidFindings += 1;
}
if (invalidFindings)
  errors.push('Gitleaks report contains findings without a valid rule id.');

// Gitleaks exits 1 for findings and also for partial scans. Both fail the job.
const exitCode = parseCount(env.GITLEAKS_EXIT_CODE);
const findingCount = findings?.length ?? null;
if (exitCode === null) {
  errors.push('Gitleaks exit code is missing or invalid.');
} else if (exitCode !== 0 && exitCode !== 1) {
  errors.push(`Gitleaks execution failed with exit code ${exitCode}.`);
} else if (exitCode === 0 && findingCount > 0) {
  errors.push('Gitleaks reported success with findings.');
} else if (exitCode === 1 && findingCount === 0) {
  errors.push('Gitleaks failed without reporting findings.');
}

// At --log-level error a complete scan prints nothing. Gitleaks 8.30.1 exits 0
// with an empty report after git errors, which only its log reveals.
const scannerLogLines = parseCount(env.GITLEAKS_LOG_LINES);
if (scannerLogLines === null)
  errors.push('Gitleaks log line count is missing or invalid.');
else if (scannerLogLines > 0)
  errors.push('Gitleaks logged errors; the scan may be incomplete.');

const status = errors.length ? 'error' : findingCount ? 'findings' : 'success';
const metadata = {
  ...evidence,
  gitleaksVersion: env.GITLEAKS_VERSION || null,
  scanScope: env.GITLEAKS_SCAN_SCOPE || null,
  logOptions: env.GITLEAKS_LOG_OPTS || null,
  exitCode,
  scannerLogLines,
  status,
  findingCount,
  ruleIds: [...ruleIds].sort(),
  errors,
};

writeJson(metadataPath, metadata);

const summary = [
  '## Secret detection',
  '',
  `Commit: \`${metadata.commit || 'unknown'}\``,
  `Scope: \`${metadata.scanScope || 'unknown'}\``,
  `Gitleaks: \`${metadata.gitleaksVersion || 'unknown'}\``,
  `Status: **${status.toUpperCase()}**`,
  `Findings: **${findingCount ?? 'unavailable'}**`,
];
if (metadata.ruleIds.length)
  summary.push(
    `Rules: ${metadata.ruleIds.map((rule) => `\`${rule}\``).join(', ')}`,
  );
if (status === 'findings')
  summary.push(
    '',
    'Reproduce locally with the same binary, configuration and range.',
  );
if (status === 'error')
  summary.push(
    '',
    'The scan was incomplete or inconsistent; inspect the scanner step.',
  );
publishSummary(summary);

if (status !== 'success') process.exitCode = 1;
