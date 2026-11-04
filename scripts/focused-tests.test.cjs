const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { ESLint } = require('eslint');
const config = require('../eslint.config.cjs');

test('the application lint config rejects focused Jest tests', async () => {
  const filePath = path.join(
    __dirname,
    '../src/updates/updates.service.spec.ts',
  );
  const effective = await new ESLint().calculateConfigForFile(filePath);
  assert.equal(effective.rules['jest/no-focused-tests'][0], 2);
  // Exercise the actual override without unrelated type checking or formatting.
  const lint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: config.at(-1),
  });
  for (const expression of [
    "it.only('focused', () => {})",
    "test.only('focused', () => {})",
    "describe.only('focused', () => {})",
    "fit('focused', () => {})",
    "fdescribe('focused', () => {})",
    "it['only']('focused', () => {})",
    "test.concurrent.only('focused', async () => {})",
    "it.concurrent['only']('focused', async () => {})",
    "test.only.each([1])('focused', () => {})",
  ]) {
    const [result] = await lint.lintText(expression, { filePath });
    assert.ok(
      result.messages.some((m) =>
        ['jest/no-focused-tests', 'no-restricted-syntax'].includes(m.ruleId),
      ),
      expression,
    );
  }
  const [normal] = await lint.lintText(
    "it('normal', () => {}); describe.skip('skipped', () => {}); // it.only\nconst text = 'fdescribe';",
    { filePath },
  );
  assert.equal(normal.errorCount, 0);
});
