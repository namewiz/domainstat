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

function createLogCapture() {
  const logs = [];
  const logger = {
    info: (message) => logs.push(message),
    warn: () => {
      // unused in these tests
    },
    error: () => {
      // unused in these tests
    },
  };
  return {
    logger,
    isCacheHit: () => logs.some((message) => message.includes('[check] cache hit')),
    reset: () => {
      logs.length = 0;
    },
  };
}

test('cacheTtl sets how long a fetched result is kept', async (t) => {
  const domain = 'example.com';
  const start = Date.now();
  let now = start;
  t.mock.method(Date, 'now', () => now);
  const { logger, isCacheHit, reset } = createLogCapture();
  const opts = { verbose: true, logger, cacheTtl: 1000 };

  await clearCache();
  await check(domain, opts);
  assert.ok(!isCacheHit(), 'First lookup should not be a cache hit');
  reset();

  now = start + 999;
  await check(domain, opts);
  assert.ok(isCacheHit(), 'Should hit the cache before cacheTtl has passed');
  reset();

  now = start + 1000;
  // Ask for a longer max age: the entry was stored for 1000ms only, so it must still be gone.
  await check(domain, { verbose: true, logger });
  assert.ok(!isCacheHit(), 'An entry should not outlive the cacheTtl it was stored with');
});

test('cacheTtl caps the age of a cached result a call accepts', async (t) => {
  const domain = 'example.com';
  const start = Date.now();
  let now = start;
  t.mock.method(Date, 'now', () => now);
  const { logger, isCacheHit, reset } = createLogCapture();

  await clearCache();
  await check(domain, { verbose: true, logger }); // stored with the default 2 hour TTL
  reset();

  now = start + 1000;
  await check(domain, { verbose: true, logger, cacheTtl: 1000 });
  assert.ok(!isCacheHit(), 'A result older than this call’s cacheTtl should not be returned');
  reset();

  await check(domain, { verbose: true, logger, cacheTtl: 0 });
  assert.ok(!isCacheHit(), 'cacheTtl: 0 should never serve from the cache');
});

test('cache: false still caches the freshly fetched result', async () => {
  const domain = 'example.com';
  const { logger, isCacheHit, reset } = createLogCapture();

  await clearCache();
  await check(domain, { verbose: true, logger, cache: false });
  assert.ok(!isCacheHit(), 'cache: false should not serve from the cache');
  reset();

  await check(domain, { verbose: true, logger, cache: false });
  assert.ok(!isCacheHit(), 'cache: false should not serve from the cache even when it is populated');
  reset();

  await check(domain, { verbose: true, logger });
  assert.ok(isCacheHit(), 'The result fetched with cache: false should have been cached');
});

test('an invalid cacheTtl is rejected', async () => {
  await assert.rejects(check('example.com', { cacheTtl: -1 }), RangeError);
  await assert.rejects(check('example.com', { cacheTtl: Number.NaN }), RangeError);
});
