import test from 'ava';
import { checkBatchStream, checkBatch, check } from '../dist/index.js';
import unavailableDomainsJson from '../src/unavailable-domains.json' with { type: 'json' };
import supportedTlDs from '../src/tlds.json' with { type: 'json' };

const tldList = Object.keys({
  ...supportedTlDs.popular,
  ...supportedTlDs.gTLDs,
  ...supportedTlDs.ccTLDs,
  ...supportedTlDs.SLDs,
});

const unavailableMap = {
  ...unavailableDomainsJson.popular,
  ...unavailableDomainsJson.gTLDs,
  ...unavailableDomainsJson.ccTLDs,
  ...unavailableDomainsJson.SLDs,
};

const unavailableDomains = tldList
  .filter((tld) => unavailableMap[tld])
  .map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));

const availableDomains = tldList.map((tld) => ({
  name: `this-domain-should-not-exist-12345.${tld}`,
  availability: 'available',
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

test('checkBatch removes duplicate domains', async (t) => {
  const results = await checkBatch([' Example.invalidtld ', 'example.INVALIDTLD']);
  t.deepEqual(
    results.map((r) => r.domain),
    ['example.invalidtld'],
  );
});

test('validator tests', async (t) => {
  const specialDomains = [
    { name: 'www.example.com', availability: 'invalid' },
    { name: 'invalid@domain', availability: 'invalid' },
    { name: 'example.invalidtld', availability: 'unsupported' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(specialDomains);
  console.log(`validator test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.validator = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.host unknown status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unknownDomains, { only: ['dns.host'] });
  console.log(`dns.host unknown status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsHostUnknown = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.host unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['dns.host'] });
  console.log(`dns.host unavailable domains test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsHostUnavailable = { pass, total, cutoff: 0.99, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.doh unknown status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unknownDomains, { only: ['dns.doh'], platform: 'browser' });
  console.log(`dns.doh unknown status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsDohUnknown = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.doh unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['dns.doh'], platform: 'browser' });
  console.log(`dns.doh unavailable status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsDohUnavailable = { pass, total, cutoff: 0.98, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.ping unknown status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unknownDomains, { only: ['dns.ping'] });
  console.log(`dns.ping test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsPingUnknown = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('dns.ping unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['dns.ping'] });
  console.log(`dns.ping test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.dnsPingUnavailable = { pass, total, cutoff: 0.7, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('whois.lib available status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(availableDomains, { only: ['whois.lib'] });
  console.log(`whois.lib available status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisLibAvailable = { pass, total, cutoff: 0.1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('whois.lib unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['whois.lib'] });
  console.log(`whois.lib unavailable status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisLibUnavailable = { pass, total, cutoff: 0.1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test.skip('whois.api available status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(availableDomains, { only: ['whois.api'] });
  console.log(`whois.api available status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisApiAvailable = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test.skip('whois.api unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['whois.api'] });
  console.log(`whois.api unavailable status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.whoisApiUnavailable = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('altstatus available status test', async (t) => {
  const domains = [
    { name: 'this-domain-should-not-exist-12345.com', availability: 'available' },
    { name: 'this-domain-should-not-exist-12345.dev', availability: 'available' },
    { name: 'this-domain-should-not-exist-12345.ng', availability: 'available' },
    { name: 'this-domain-should-not-exist-12345.com.ng', availability: 'available' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, {
    only: ['altstatus'],
    apiKeys: { domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3' },
  });
  console.log(`altstatus available status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.altStatusAvailable = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('altstatus unavailable status test', async (t) => {
  const domains = [
    { name: 'google.dev', availability: 'unavailable' },
    { name: 'jiji.ng', availability: 'unavailable' },
    { name: 'amazon.com', availability: 'unavailable' },
  ];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, {
    only: ['altstatus'],
    apiKeys: { domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3' },
  });
  console.log(`altstatus unavailable status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.altStatusUnavailable = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('rdap available status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(availableDomains, { only: ['rdap'] });
  console.log(`rdap available status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.rdapAvailable = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('rdap unavailable status tests', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { only: ['rdap'] });
  console.log(`rdap unavailable status test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.rdapUnavailable = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('.ng TLD tests', async (t) => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const availableDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = ngTlds
    .filter((tld) => unavailableMap[tld])
    .map((tld) => ({
      name: unavailableMap[tld],
      availability: 'unavailable',
    }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains);
  console.log(`.ng test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.ng = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('.ng TLD tests with rdap', async (t) => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const availableDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = ngTlds
    .filter((tld) => unavailableMap[tld])
    .map((tld) => ({
      name: unavailableMap[tld],
      availability: 'unavailable',
    }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, { only: ['rdap'] });
  console.log(`.ng test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.ngRdap = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('browser platform tests', async (t) => {
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(domains, { platform: 'browser' });
  console.log(`browser platform test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.browser = { pass, total, cutoff: 0.8, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('each adapter sets raw field', async (t) => {
  const adapters = [
    { ns: 'dns.host', opts: {} },
    { ns: 'dns.doh', opts: { platform: 'browser' } },
    { ns: 'dns.ping', opts: {} },
    { ns: 'rdap', opts: {} },
    // todo: fix
    // { ns: 'altstatus.domainr', opts: { apiKeys: {domainr: '7b6e2a71bcmshf310d57fbbe5248p135b4djsn3c1aa3c16ca3'}} },
    // { ns: 'altstatus.mono', opts: {} },
    { ns: 'whois.lib', opts: {} },
  ];

  for (const { ns, opts } of adapters) {
    const [result] = await checkBatch(['example.com'], { only: [ns], ...opts, verbose: true });
    t.true(Object.prototype.hasOwnProperty.call(result.raw, ns), `${ns} should set raw field`);
    t.true(Object.prototype.hasOwnProperty.call(result.latencies, ns), `${ns} should report latency`);
  }
});

test('burstMode available domain', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(availableDomains, { burstMode: true, skip: ['whois.api'] });
  console.log(`burstMode available test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.burstModeAvailable = { pass, total, cutoff: 0.95, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
});

test('burstMode unavailable domain', async (t) => {
  const { pass, total, contradictions, latencySum, latencyCount } = await runTest(unavailableDomains, { burstMode: true, skip: ['whois.api'] });
  console.log(`burstMode unavailable test results: ${((pass * 100) / total).toFixed(2)}%`);
  testSummary.burstModeUnavailable = { pass, total, cutoff: 1, latencySum, latencyCount, contradictions };
  t.true(contradictions === 0);
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
  for (const [key, { pass, total, cutoff, latencySum, latencyCount, contradictions = 0 }] of Object.entries(testSummary)) {
    const ratio = `${pass}/${total}`;
    const percent = `${((pass / total) * 100).toFixed(2)}%`;
    const passed = pass / total >= cutoff;
    const avgLatency = '' + latencyCount ? (latencySum / latencyCount).toFixed(2) : 'N/A';
    const color = passed && contradictions === 0 ? GREEN : RED;
    console.log(
      color +
        `- ${key.padEnd(20)}${ratio.padEnd(10)}${percent.padStart(8)}  contradictions: ${String(contradictions).padStart(3)}  avg: ${avgLatency.padStart(9)}ms/req total: ${latencySum}ms` +
        RESET,
    );
  }
}

test.after.always(() => {
  printSummary();
});
