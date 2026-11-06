import assert from 'node:assert';
import { test } from 'node:test';
import { check, clearCache } from '../dist/index.js';

test('clearCache should empty the cache', async (t) => {
  const domain = 'example.com';
  const logs = [];
  const logger = {
    info: (message) => logs.push(message),
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
    logs.some((message) => message.includes('[check] cache hit')),
    'Should have hit the cache',
  );
  logs.length = 0;

  // 3. Clear cache
  await clearCache();

  // 4. Third check should NOT be a cache hit
  await check(domain, { verbose: true, logger });
  assert.ok(
    !logs.some((message) => message.includes('[check] cache hit')),
    'Should NOT have hit the cache after clearing',
  );
  assert.ok(
    logs.some((l) => l.includes('[check] domain=')),
    'Should have performed a fresh lookup',
  );
});

test('cached results expire after 2 hours', async (t) => {
  const domain = 'example.com';
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const start = Date.now();
  let now = start;
  t.mock.method(Date, 'now', () => now);

  const logs = [];
  const logger = {
    info: (message) => logs.push(message),
    warn: () => {
      // unused in this test
    },
    error: () => {
      // unused in this test
    },
  };
  const isCacheHit = () => logs.some((message) => message.includes('[check] cache hit'));

  await clearCache();
  await check(domain, { verbose: true, logger });
  assert.ok(!isCacheHit(), 'First lookup should not be a cache hit');
  logs.length = 0;

  now = start + twoHoursMs - 1;
  await check(domain, { verbose: true, logger });
  assert.ok(isCacheHit(), 'Should still hit the cache just before 2 hours');
  logs.length = 0;

  now = start + twoHoursMs;
  await check(domain, { verbose: true, logger });
  assert.ok(!isCacheHit(), 'Should NOT hit the cache once 2 hours have passed');
  assert.ok(
    logs.some((l) => l.includes('[check] domain=')),
    'Should have performed a fresh lookup after expiry',
  );
});
