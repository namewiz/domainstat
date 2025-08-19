import test from 'ava';
import { checkBatchStream } from '../dist/index.js';
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

const unavailableDomains = tldList.filter(tld => unavailableMap[tld]).map((tld) => ({
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

async function runTest(domains, opts = {}) {
  const expectedMap = Object.fromEntries(domains.map((d) => [d.name, d.availability]));
  const uniqueNames = Array.from(new Set(Object.keys(expectedMap)));
  let pass = 0;
  for await (const res of checkBatchStream(uniqueNames, opts)) {
    const expected = expectedMap[res.domain];
    const msg = `domain:${res.domain}, expected:${expected}, got:${res.availability}, resolver:${res.resolver}`;
    if (res.availability === expected) {
      console.log(`PASSED: ${msg}`);
      pass++;
    } else {
      const failMsg = `FAILED: ${msg}\n\t${res.error ?? 'No error message provided'}`;
      console.error(`\x1b[31m${failMsg}\x1b[0m`);
    }
  }
  return { pass, total: uniqueNames.length };
}

test.serial('validator tests', async (t) => {
  const specialDomains = [
    { name: 'www.example.com', availability: 'invalid' },
    { name: 'invalid@domain', availability: 'invalid' },
    { name: 'example.invalidtld', availability: 'unsupported' },
  ];
  const { pass, total } = await runTest(specialDomains);
  console.log(`validator test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.validator = { pass, total, cutoff: 1 };
  t.is(pass, total);
});

test.serial('dns.host unknown status tests', async (t) => {
  const { pass, total } = await runTest(unknownDomains, { only: ['dns.host'] });
  console.log(`dns.host unknown status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsHostUnknown = { pass, total, cutoff: 1 };
  t.true(pass / total >= 1);
});

test.serial('dns.host unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['dns.host'] });
  console.log(`dns.host unavailable domains test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsHostUnavailable = { pass, total, cutoff: 0.99 };
  t.true(pass / total >= 0.99);
});

test.serial('dns.doh unknown status tests', async (t) => {
  const { pass, total } = await runTest(unknownDomains, { only: ['dns.doh'], platform: 'browser' });
  console.log(`dns.doh unknown status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsDohUnknown = { pass, total, cutoff: 1 };
  t.true(pass / total >= 1);
});

test.serial('dns.doh unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['dns.doh'], platform: 'browser' });
  console.log(`dns.doh unavailable status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsDohUnavailable = { pass, total, cutoff: 0.98 };
  t.true(pass / total >= 0.98);
});

test.serial('dns.ping unknown status tests', async (t) => {
  const { pass, total } = await runTest(unknownDomains, { only: ['dns.ping'] });
  console.log(`dns.ping test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsPingUnknown = { pass, total, cutoff: 1 };
  t.true(pass / total >= 1);
});

test.serial('dns.ping unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['dns.ping'] });
  console.log(`dns.ping test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsPingUnavailable = { pass, total, cutoff: 0.7 };
  t.true(pass / total >= 0.7);
});

test.serial('whois.lib available status tests', async (t) => {
  const { pass, total } = await runTest(availableDomains, { only: ['whois.lib'] });
  console.log(`whois.lib available status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.whoisLibAvailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial('whois.lib unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['whois.lib'] });
  console.log(`whois.lib unavailable status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.whoisLibUnavailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial.skip('whois.api available status tests', async (t) => {
  const { pass, total } = await runTest(availableDomains, { only: ['whois.api'] });
  console.log(`whois.api available status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.whoisApiAvailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial.skip('whois.api unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['whois.api'] });
  console.log(`whois.api unavailable status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.whoisApiUnavailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial('rdap available status tests', async (t) => {
  const { pass, total } = await runTest(availableDomains, { only: ['rdap'] });
  console.log(`rdap available status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.rdapAvailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial('rdap unavailable status tests', async (t) => {
  const { pass, total } = await runTest(unavailableDomains, { only: ['rdap'] });
  console.log(`rdap unavailable status test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.rdapUnavailable = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

test.serial('.ng TLD tests', async (t) => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const availableDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = ngTlds.filter(tld => unavailableMap[tld]).map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains);
  console.log(`.ng test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.ng = { pass, total, cutoff: 1 };
  t.true(pass / total == 1);
});

test.serial('.ng TLD tests with rdap', async (t) => {
  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const availableDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = ngTlds.filter(tld => unavailableMap[tld]).map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { only: ['rdap'] });
  console.log(`.ng test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.ng = { pass, total, cutoff: 1 };
  t.true(pass / total == 1);
});


test.serial('browser platform tests', async (t) => {
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { platform: 'browser' });
  console.log(`browser platform test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.browser = { pass, total, cutoff: 0.80 };
  t.true(pass / total >= 0.80);
});

function printSummary() {
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';

  console.log('\nTest Summary:');
  for (const [key, { pass, total, cutoff }] of Object.entries(testSummary)) {
    const ratio = `${pass}/${total}`;
    const percent = `${(pass / total * 100).toFixed(2)}%`;
    const passed = pass / total >= cutoff;

    const color = passed ? GREEN : RED;

    console.log(
      color +
      `- ${key.padEnd(20)}${ratio.padEnd(10)}${percent.padStart(8)}` +
      RESET
    );
  }
}

test.after.always(() => {
  printSummary();
});

