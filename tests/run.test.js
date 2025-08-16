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

const testSummary = {};

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
  testSummary.validator = { pass, total };
  t.is(pass, total);
});

test.serial('checkBatch tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping checkBatch tests due to lack of network access');
    t.pass();
    return;
  }

  const availableDomains = tldList.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = tldList.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains);
  console.log(`checkBatch test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.checkBatch = { pass, total };
  t.true(pass / total > 0.9);
});

test.serial('dns.host tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping checkBatch tests due to lack of network access');
    t.pass();
    return;
  }

  const unknownDomains = tldList.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'unknown',
  }));
  const unavailableDomains = tldList.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...unknownDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { only: ['dns.host'] });
  console.log(`dns.host test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.dnsHost = { pass, total };
  t.true(pass / total > 0.95);
});

test.serial('rdap tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping rdap tests due to lack of network access');
    t.pass();
    return;
  }

  const availableDomains = tldList.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = tldList.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { only: ['rdap'] });
  console.log(`rdap test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.rdap = { pass, total };
  t.true(pass / total > 0.80);
});

test.serial('.ng TLD tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping .ng TLD tests due to lack of network access');
    t.pass();
    return;
  }

  const ngTlds = tldList.filter((tld) => tld === 'ng' || tld.endsWith('.ng'));
  const availableDomains = ngTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = ngTlds.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains);
  console.log(`.ng test results: ${(pass * 100 / total).toFixed(2)}%`);
  testSummary.ng = { pass, total };
  t.true(pass / total > 0.80);
});

function printSummary() {
  console.log('\nTest Summary:');
  for (const [key, { pass, total }] of Object.entries(testSummary)) {
    console.log(`- ${key}\t: ${pass}/${total}\t (${(pass / total * 100).toFixed(2)}%)`);
  }
}
test.after.always(() => {
  printSummary();
});

