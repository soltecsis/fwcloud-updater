const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const config = require('./trivy-config.json');

test(
  'native Trivy blocks HIGH/CRITICAL including unfixed findings and rejects malformed input',
  { skip: !process.env.TRIVY_BINARY },
  (t) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fwcloud-updater-native-trivy-'),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const reportPath = path.join(root, 'trivy.json');
    const blockingPath = path.join(root, 'blocking.txt');
    const check = () => {
      const result = spawnSync(
        process.env.TRIVY_BINARY,
        [
          'convert',
          '--config',
          '/dev/null',
          '--ignorefile',
          '/dev/null',
          '--quiet',
          '--format',
          'table',
          '--scanners',
          'vuln',
          '--severity',
          config.blockingSeverities.join(','),
          '--exit-code',
          String(config.findingsExitCode),
          reportPath,
        ],
        { cwd: root, encoding: 'utf8' },
      );
      fs.writeFileSync(blockingPath, result.stdout + result.stderr);
      return result.status;
    };
    for (const severity of ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const input = JSON.stringify({
        SchemaVersion: 2,
        ArtifactType: 'repository',
        Results: [
          {
            Target: 'package-lock.json',
            Class: 'lang-pkgs',
            Type: 'npm',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2099-0001',
                PkgName: 'synthetic-package',
                InstalledVersion: '1.0.0',
                Severity: severity,
              },
            ],
          },
        ],
      });
      fs.writeFileSync(reportPath, input);
      assert.equal(
        check(),
        config.blockingSeverities.includes(severity)
          ? config.findingsExitCode
          : 0,
      );
      assert.equal(fs.readFileSync(reportPath, 'utf8'), input);
      const blocking = fs.readFileSync(blockingPath, 'utf8');
      assert.equal(
        blocking.includes('CVE-2099-0001'),
        config.blockingSeverities.includes(severity),
        blocking,
      );
    }
    fs.writeFileSync(reportPath, '{}broken');
    assert.equal(check(), 1);
  },
);
