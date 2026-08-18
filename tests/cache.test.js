import assert from 'node:assert';
import { test } from 'node:test';
import { check, clearCache } from '../dist/index.js';

test('clearCache should empty the cache', async (t) => {
  const domain = 'example.com';
  const logs = [];
  const logger = {
    info: (msg) => logs.push(msg),
    warn: () => {
      // unused in this test
    },
    error: () => {
      // unused in this test
    },
  };

  // 1. First check to populate cache
  await check(domain, { verbose: true, logger });
  assert.ok(
    logs.some((l) => l.includes('[check] domain=')),
    'Should have performed a lookup',
  );
  logs.length = 0;

  // 2. Second check should be a cache hit
  await check(domain, { verbose: true, logger });
  assert.ok(
    logs.some((l) => l.includes('[check] cache hit')),
    'Should have hit the cache',
  );
  logs.length = 0;

  // 3. Clear cache
  await clearCache();

  // 4. Third check should NOT be a cache hit
  await check(domain, { verbose: true, logger });
  assert.ok(!logs.some((l) => l.includes('[check] cache hit')), 'Should NOT have hit the cache after clearing');
  assert.ok(
    logs.some((l) => l.includes('[check] domain=')),
    'Should have performed a fresh lookup',
  );
});
