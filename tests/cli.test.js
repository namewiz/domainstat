import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('CLI streams validator results as JSON', async () => {
  const domains = ['Example.INVALIDTLD', 'invalid@domain'];
  const child = spawn(process.execPath, [cliPath, '--json', '--only', 'validator', ...domains], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  assert.strictEqual(exitCode, 0);
  assert.strictEqual(stderr.trim(), '');

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.strictEqual(lines.length, domains.length);

  const results = lines.map((line) => JSON.parse(line));
  const domainsReturned = new Set(results.map((res) => res.domain));
  assert.deepStrictEqual(domainsReturned, new Set(domains.map((d) => d.toLowerCase())));

  for (const res of results) {
    assert.strictEqual(res.resolver, 'validator');
    assert.ok(['invalid', 'unsupported'].includes(res.availability));
  }
});
