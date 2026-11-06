import assert from 'node:assert';
import { test } from 'node:test';

// Make the library pick its CacheStorage-backed cache: it checks for a browser
// global scope (`window === globalThis`) with `caches`, `Request` and `Response`
// when the module loads. This file runs in its own process, so it is safe to
// set these globals before importing.
const entries = new Map();
const deletedUrls = [];
globalThis.window = globalThis;
globalThis.caches = {
  async open() {
    return {
      async match(request) {
        return entries.get(request.url)?.clone();
      },
      async put(request, response) {
        entries.set(request.url, response);
      },
      async delete(request) {
        deletedUrls.push(request.url);
        return entries.delete(request.url);
      },
    };
  },
  async delete() {
    entries.clear();
    return true;
  },
};

const { check } = await import('../dist/index.js');

test('browser cache honours the 2 hour TTL', async (t) => {
  const domain = 'example.com';
  const cacheUrl = `https://domainstat.local/cache/${encodeURIComponent(domain)}`;
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

  // An entry written by an older version has no expiry header: it must be treated as expired.
  entries.set(
    cacheUrl,
    new Response(JSON.stringify({ domain, availability: 'registered', resolver: 'dns.host' }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  await check(domain, { verbose: true, logger });
  assert.ok(!isCacheHit(), 'A legacy entry without an expiry header should not be a cache hit');
  assert.ok(deletedUrls.includes(cacheUrl), 'The legacy entry should be deleted');
  assert.ok(entries.get(cacheUrl)?.headers.get('x-domainstat-expires-at'), 'The fresh result should carry an expiry');
  logs.length = 0;

  now = start + twoHoursMs - 1;
  await check(domain, { verbose: true, logger });
  assert.ok(isCacheHit(), 'Should still hit the cache just before 2 hours');
  logs.length = 0;

  deletedUrls.length = 0;
  now = start + twoHoursMs;
  await check(domain, { verbose: true, logger });
  assert.ok(!isCacheHit(), 'Should NOT hit the cache once 2 hours have passed');
  assert.ok(deletedUrls.includes(cacheUrl), 'The expired entry should be deleted');
});
