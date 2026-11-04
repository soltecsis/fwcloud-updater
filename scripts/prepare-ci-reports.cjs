// Each invocation owns its evidence; a failed Jest startup cannot reuse an
// earlier run's successful reports or analysis.
const fs = require('node:fs');

for (const dir of ['reports/tests', 'reports/coverage']) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
fs.rmSync('reports/metadata.json', { force: true });
