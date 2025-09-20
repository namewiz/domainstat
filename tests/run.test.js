import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBatchStream, checkBatch, check } from '../dist/index.js';
import registeredDomainsJson from '../src/registered-domains.json' with { type: 'json' };
import supportedTlDs from '../src/tlds.json' with { type: 'json' };

const tldList = Object.keys({
  ...supportedTlDs.popular,
  ...supportedTlDs.gTLDs,
  ...supportedTlDs.ccTLDs,
  ...supportedTlDs.SLDs,
});

const registeredMap = {
  ...registeredDomainsJson.popular,
  ...registeredDomainsJson.gTLDs,
  ...registeredDomainsJson.ccTLDs,
  ...registeredDomainsJson.SLDs,
};

const registeredDomains = tldList
  .filter((tld) => registeredMap[tld])
  .map((tld) => ({
    name: registeredMap[tld],
    availability: 'registered',
  }));

const unregisteredDomains = tldList.map((tld) => ({
  name: `this-domain-should-not-exist-12345.${tld}`,
  availability: 'unregistered',
}));

const unknownDomains = tldList.map((tld) => ({
  name: `this-domain-should-not-exist-12345.${tld}`,
  availability: 'unknown',
}));

async function hasNetwork() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch('https://example.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
if (!(await hasNetwork())) {
  console.warn('No network access, several tests may fail');
}

const testSummary = {};
const contradictoryCases = [];

async function runTest(domains, opts = {}) {
  const expectedMap = Object.fromEntries(domains.map((d) => [d.name, d.availability]));
  const uniqueNames = Array.from(new Set(Object.keys(expectedMap)));
  let pass = 0;
  let unresolved = 0; // cases treated as unresolved (e.g., got 'unknown')
  let contradictions = 0; // definitive mismatches
  let latencySum = 0;
  let latencyCount = 0;
  for await (const res of checkBatchStream(uniqueNames, opts)) {
    const expected = expectedMap[res.domain];
    const actual = res.availability;
    const msg = `domain:${res.domain}, expected:${expected}, got:${actual}, resolver:${res.resolver}`;
    if (actual === expected) {
      console.log(`PASSED: ${msg}`);
      pass++;
    } else if (actual !== 'unknown' && expected !== 'unknown') {
      const failMsg = `CONTRADICTION: ${msg}\n\t${res.error?.message ?? 'No error message provided'}`;
      console.error(`\x1b[31mError: ${failMsg}\x1b[0m`);
      contradictoryCases.push({
        domain: res.domain,
        expected,
        actual,
        resolver: res.resolver,
        error: res.error?.message ?? 'No error message provided',
      });
      contradictions++;
    } else {
      console.warn(`UNRESOLVED: ${msg}`);
      unresolved++;
    }
    if (res.latencies) {
      for (const value of Object.values(res.latencies)) {
        latencySum += value;
        latencyCount++;
      }
    }
  }
  return { pass, unresolved, contradictions, total: uniqueNames.length, latencySum, latencyCount };
}

test('checkBatch removes duplicate domains', async () => {
  const results = await checkBatch([' Example.invalidtld ', 'example.INVALIDTLD']);
  assert.deepStrictEqual(
    results.map((r) => r.domain),
    ['example.invalidtld'],
  );
});

test('validator tests', async () => {
  const specialDomains = [
    { name: 'www.example.com', availability: 'invalid' },
    { name: 'invalid@domain', availability: 'invalid' },
    { name: 'example.invalidtld', availability: 'unsupported' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(specialDomains);
  console.log(`validator test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.validator = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

// Node-specific DNS (host) tests removed

test('dns.doh unknown status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unknownDomains, {
    only: ['dns.doh'],
  });
  console.log(`dns.doh unknown status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsDohUnknown = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('dns.doh registered status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(registeredDomains, {
    only: ['dns.doh'],
  });
  console.log(`dns.doh registered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsDohRegistered = { pass, total, cutoff: 0.98, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

// Node-specific ping tests removed

// Node-specific whois library tests removed

test.skip('whois.api unregistered status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unregisteredDomains, {
    only: ['whois.api'],
  });
  console.log(`whois.api unregistered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisApiUnregistered = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test.skip('whois.api registered status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(registeredDomains, {
    only: ['whois.api'],
  });
  console.log(`whois.api registered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisApiRegistered = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('altstatus unregistered status test', async () => {
  const domains = [
    { name: 'this-domain-should-not-exist-12345.com', availability: 'unregistered' },
    { name: 'this-domain-should-not-exist-12345.dev', availability: 'unregistered' },
    { name: 'this-domain-should-not-exist-12345.ng', availability: 'unregistered' },
    { name: 'this-domain-should-not-exist-12345.com.ng', availability: 'unregistered' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, {
    only: ['altstatus'],
    apiKeys: { domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3' },
  });
  console.log(`altstatus unregistered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.altStatusUnregistered = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('altstatus registered status test', async () => {
  const domains = [
    { name: 'google.dev', availability: 'registered' },
    { name: 'jiji.ng', availability: 'registered' },
    { name: 'amazon.com', availability: 'registered' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, {
    only: ['altstatus'],
    apiKeys: { domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3' },
  });
  console.log(`altstatus registered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.altStatusRegistered = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('rdap unregistered status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unregisteredDomains, {
    only: ['rdap'],
  });
  console.log(`rdap unregistered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.rdapUnregistered = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('rdap registered status tests', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(registeredDomains, {
    only: ['rdap'],
  });
  console.log(`rdap registered status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.rdapRegistered = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('.ng TLD tests', async () => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const unregisteredDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'unregistered',
  }));
  const registeredDomains = ngTlds
    .filter((tld) => registeredMap[tld])
    .map((tld) => ({
      name: registeredMap[tld],
      availability: 'registered',
    }));
  const domains = [...unregisteredDomains, ...registeredDomains];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains);
  console.log(`.ng test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.ng = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('.ng TLD tests with rdap', async () => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const unregisteredDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'unregistered',
  }));
  const registeredDomains = ngTlds
    .filter((tld) => registeredMap[tld])
    .map((tld) => ({
      name: registeredMap[tld],
      availability: 'registered',
    }));
  const domains = [...unregisteredDomains, ...registeredDomains];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, { only: ['rdap'] });
  console.log(`.ng test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.ngRdap = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

// platform tests removed

test('each adapter sets raw field', async () => {
  const adapters = [
    { ns: 'dns.doh', opts: {} },
    { ns: 'rdap', opts: {} },
    // { ns: 'altstatus.domainr', opts: { apiKeys: {domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3'}} },
    // { ns: 'altstatus.mono', opts: {} },
    { ns: 'whois.api', opts: {} },
  ];

  for (const { ns, opts } of adapters) {
    const [result] = await checkBatch(['example.com'], { only: [ns], ...opts, verbose: true });
    assert.ok(Object.prototype.hasOwnProperty.call(result.raw, ns), `${ns} should set raw field`);
    assert.ok(Object.prototype.hasOwnProperty.call(result.latencies, ns), `${ns} should report latency`);
  }
});

test('burstMode unregistered domain', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unregisteredDomains, {
    burstMode: true,
    skip: ['whois.api'],
  });
  console.log(`burstMode unregistered test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.burstModeUnregistered = { pass, total, cutoff: 0.95, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

test('burstMode registered domain', async () => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(registeredDomains, {
    burstMode: true,
    skip: ['whois.api'],
  });
  console.log(`burstMode registered test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.burstModeRegistered = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  assert.strictEqual(contradictions, 0);
});

function printSummary() {
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';

  // Print collected contradictory cases, if any
  if (contradictoryCases.length > 0) {
    console.log('\nContradictory Cases:');
    for (const c of contradictoryCases) {
      console.log(
        RED +
          `- domain:${c.domain} expected:${c.expected} got:${c.actual} resolver:${c.resolver}\n  ${c.error}` +
          RESET,
      );
    }
  }

  // Report average latency per adapter request (ms) for each test in summary
  console.log('\nTest Summary:');
  for (const [key, { pass, total, cutoff, latencySum, latencyCount, contradictions = 0 }] of Object.entries(
    testSummary,
  )) {
    const ratio = `${pass}/${total}`;
    const percent = `${((pass / total) * 100).toFixed(2)}%`;
    const passed = pass / total >= cutoff;
    const avgLatency = '' + latencyCount ? (latencySum / latencyCount).toFixed(2) : 'N/A';
    const color = passed && contradictions === 0 ? GREEN : RED;
    console.log(
      color +
        `- ${key.padEnd(25)}${ratio.padEnd(10)}${percent.padStart(8)}  contradictions: ${String(contradictions).padStart(3)}  avg: ${avgLatency.padStart(9)}ms/req total: ${latencySum}ms` +
        RESET,
    );
  }
}

test.after(() => {
  printSummary();
});
