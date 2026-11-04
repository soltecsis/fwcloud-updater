const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const workflow = fs.readFileSync(
  path.join(__dirname, '../.github/workflows/nodejs.yml'),
  'utf8',
);
const job = (name) =>
  workflow.split(`\n  ${name}:\n`)[1]?.split(/\n {2}[\w-]+:\n/)[0];
const sonar = job('sonar');
const aggregate = job('updater-ci');
const expression = (text) => text.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '');
const eligible = expression(
  sonar.match(/^ {4}if: >-\n([\s\S]*?)\n {4}runs-on:/m)[1],
);

test('Sonar and the aggregate apply the same fork/Dependabot eligibility', () => {
  const required = expression(
    aggregate.match(
      /^ {10}SONAR_REQUIRED: >-\n([\s\S]*?)\n {10}SONAR_SKIP_REASON:/m,
    )[1],
  );
  const reason = expression(
    aggregate.match(/^ {10}SONAR_SKIP_REASON: (.+)$/m)[1],
  );
  assert.equal(required.replace(/\s+/g, ' '), eligible.replace(/\s+/g, ' '));
  for (const [event, actor, author, repository, expected] of [
    ['push', 'maintainer', '', '', true],
    ['workflow_dispatch', 'maintainer', '', '', true],
    [
      'pull_request',
      'maintainer',
      'contributor',
      'soltecsis/fwcloud-updater',
      true,
    ],
    [
      'pull_request',
      'maintainer',
      'contributor',
      'contributor/fwcloud-updater',
      false,
    ],
    [
      'pull_request',
      'dependabot[bot]',
      'dependabot[bot]',
      'soltecsis/fwcloud-updater',
      false,
    ],
    [
      'pull_request',
      'maintainer',
      'dependabot[bot]',
      'soltecsis/fwcloud-updater',
      false,
    ],
    ['push', 'dependabot[bot]', '', '', false],
    ['workflow_dispatch', 'dependabot[bot]', '', '', false],
  ]) {
    const github = {
      event_name: event,
      actor,
      repository: 'soltecsis/fwcloud-updater',
      event: {
        pull_request: {
          head: { repo: { full_name: repository } },
          user: { login: author },
        },
      },
    };
    assert.equal(
      vm.runInNewContext(eligible, { github }, { timeout: 100 }),
      expected,
      `${event}/${actor}/${author}/${repository}`,
    );
    if (!expected) {
      assert.equal(
        vm.runInNewContext(reason, { github }, { timeout: 100 }),
        actor === 'dependabot[bot]' || author === 'dependabot[bot]'
          ? 'Dependabot execution'
          : 'fork pull request',
      );
    }
  }
});

test('the actual aggregate shell enforces all checks across 2048 result combinations', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-sonar-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const body = aggregate.match(/^ {8}run: \|\n([\s\S]*)$/m)[1];
  const script = path.join(root, 'aggregate.sh');
  const summary = path.join(root, 'summary.md');
  fs.writeFileSync(script, body.replace(/^ {10}/gm, ''));
  const result = spawnSync(
    'bash',
    [
      '-e',
      '-c',
      `
        for QUALITY_RESULT in success failure skipped cancelled; do
          for TEST_RESULT in success failure skipped cancelled; do
            for SECRETS_RESULT in success failure skipped cancelled; do
              for SCA_RESULT in success failure skipped cancelled; do
                for SONAR_RESULT in success failure skipped cancelled; do
                  for SONAR_REQUIRED in true false; do
                    export QUALITY_RESULT TEST_RESULT SECRETS_RESULT SCA_RESULT SONAR_RESULT SONAR_REQUIRED
                    EXPECTED=1
                    if [ "$QUALITY_RESULT" = success ] && [ "$TEST_RESULT" = success ] &&
                       [ "$SECRETS_RESULT" = success ] && [ "$SCA_RESULT" = success ]; then
                      if { [ "$SONAR_REQUIRED" = true ] && [ "$SONAR_RESULT" = success ]; } ||
                         { [ "$SONAR_REQUIRED" = false ] && [ "$SONAR_RESULT" = skipped ]; }; then
                        EXPECTED=0
                      fi
                    fi
                    if bash -e "$1"; then ACTUAL=0; else ACTUAL=$?; fi
                    if [ "$ACTUAL" -ne "$EXPECTED" ]; then
                      echo "Unexpected gate: $QUALITY_RESULT/$TEST_RESULT/$SECRETS_RESULT/$SCA_RESULT/$SONAR_RESULT required=$SONAR_REQUIRED" >&2
                      exit 1
                    fi
                  done
                done
              done
            done
          done
        done
      `,
      'aggregate-matrix',
      script,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summary,
        SONAR_SKIP_REASON: 'fork pull request',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const lines = fs.readFileSync(summary, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1024);
  assert.ok(lines.every((line) => line.includes('fork pull request')));
  assert.ok(
    lines.every((line) => line.includes('Gitleaks and Trivy remain required')),
  );
});

test('the scanner consumes same-run coverage and retains failure evidence without npm installation', () => {
  assert.match(sonar, /needs: \[quality, test, secrets, sca\]/);
  assert.match(aggregate, /needs: \[quality, test, secrets, sca, sonar\]/);
  assert.match(sonar, /ref: \$\{\{ env\.ANALYSIS_COMMIT \}\}/);
  assert.match(sonar, /fetch-depth: 0/);
  assert.match(sonar, /persist-credentials: false/);
  assert.match(
    sonar,
    /name: updater-coverage-node22-\$\{\{ github\.run_id \}\}/,
  );
  assert.doesNotMatch(sonar, /run-id:|npm |continue-on-error:|\.scannerwork/);
  assert.match(
    sonar,
    /SonarSource\/sonarqube-scan-action@d209202bc7d53ff1cc128f7f907dac145c9d6ae9/,
  );
  assert.match(sonar, /scannerVersion: 8\.1\.0\.6389/);
  assert.match(sonar, /skipSignatureVerification: false/);
  assert.equal(workflow.match(/^ {10}SONAR_TOKEN: /gm).length, 1);
  assert.equal(workflow.match(/secrets\.SONAR_TOKEN/g).length, 2);
  assert.match(sonar, /id: scan\n[^]*?env:\n {10}SONAR_TOKEN:/);
  assert.match(sonar, /args: \$\{\{ steps\.analysis\.outputs\.args \}\}/);
  for (const step of [
    'Record aggregate analysis evidence',
    'Upload aggregate SonarQube evidence',
  ]) {
    assert.ok(
      sonar.includes(
        `- name: ${step}\n        if: \${{ always() && steps.checkout.outcome == 'success' }}`,
      ),
    );
  }
  assert.match(sonar, /path: reports\/sonar\/metadata\.json/);
  assert.match(
    sonar,
    /name: updater-sonarqube-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
});

test('the actual preflight shell fails without a token before invoking coverage preparation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-sonar-token-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const analysis = sonar
    .split('- name: Verify revision, coverage and scanner configuration\n')[1]
    .split('\n      - name:')[0];
  assert.match(
    analysis,
    /SONAR_TOKEN_AVAILABLE: \$\{\{ secrets\.SONAR_TOKEN != '' \}\}/,
  );
  const body = analysis
    .match(/^ {8}run: \|\n([\s\S]*)$/m)[1]
    .replace(/^ {10}/gm, '');
  const helper = path.join(root, 'helper-args.txt');
  fs.writeFileSync(
    path.join(root, 'node'),
    '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$HELPER_ARGUMENTS"\n',
    { mode: 0o755 },
  );
  for (const available of [undefined, '', 'false', 'true']) {
    fs.rmSync(helper, { force: true });
    const env = {
      ...process.env,
      PATH: `${root}${path.delimiter}${process.env.PATH}`,
      RUNNER_TEMP: `${root}/runner temp`,
      HELPER_ARGUMENTS: helper,
    };
    delete env.SONAR_TOKEN_AVAILABLE;
    if (available !== undefined) env.SONAR_TOKEN_AVAILABLE = available;
    const result = spawnSync('bash', ['-e', '-c', body], {
      env,
      encoding: 'utf8',
    });
    if (available === 'true') {
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.deepEqual(fs.readFileSync(helper, 'utf8').trim().split('\n'), [
        'scripts/sonar-analysis.cjs',
        'prepare',
        `${root}/runner temp/updater-coverage`,
      ]);
    } else {
      assert.equal(result.status, 1, result.stderr || result.error?.message);
      assert.match(result.stderr, /SONAR_TOKEN is required/);
      assert.equal(fs.existsSync(helper), false);
    }
  }
});
