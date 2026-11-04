# FWCloud-Updater
This is the repository for FWCloud-Updater process whose main purpose is allow the updating of the FWCloud-UI and FWCloud-API modules throught FWCloud-UI.

Please, go to our main website for full information about it: https://fwcloud.net

FWCloud's source code is published under the free software license GNU AGPL, v3 and thus is freely available for download, use and share.

## Dependency scanning and SBOM

GitHub Actions uses the verified, pinned Trivy CLI to scan runtime and development
dependencies and generate a CycloneDX SBOM. HIGH/CRITICAL findings and invalid or
incomplete evidence block `updater-ci`. The
`updater-sca-sbom-<RUN_ID>-<ATTEMPT>` artifact preserves vulnerability reports,
the SBOM, scanner/database versions and diagnostic evidence, including on failure.
Requested retention is 90 days. See [the CI documentation](.github/CI-UPDATER.md)
for policy, artifacts and verification status.

## SonarQube in CI

SonarQube Cloud uses the official scan action and imports validated Node.js 22 LCOV
coverage from the same workflow execution. A failed Quality Gate, scanner error or
gate timeout blocks `updater-ci` on eligible pushes, internal PRs and manual runs.
Fork PRs and Dependabot executions follow the documented exclusions. See
[the CI documentation](.github/CI-UPDATER.md) for implementation and verification
status, and [SonarQube setup](docs/SONARQUBE.md) for configuration and coverage checks.
