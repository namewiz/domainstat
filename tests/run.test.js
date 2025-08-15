import test from 'ava';
import { checkBatchStream } from '../dist/index.js';
import unavailableDomainsJson from '../src/unavailable-domains.json' with { type: 'json' };

const unavailableMap = {
  ...unavailableDomainsJson.popular,
  ...unavailableDomainsJson.gTLDs,
  ...unavailableDomainsJson.ccTLDs,
  ...unavailableDomainsJson.SLDs,
};

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
    if (res.availability === expected) {
      pass++;
    }
  }
  return { pass, total: uniqueNames.length };
}

const testTlds = ['com', 'net', 'org', 'info', 'dev'];

test.serial('validator tests', async (t) => {
  const specialDomains = [
    { name: 'www.example.com', availability: 'invalid' },
    { name: 'invalid@domain', availability: 'invalid' },
    { name: 'example.invalidtld', availability: 'unsupported' },
  ];
  const { pass, total } = await runTest(specialDomains);
  t.is(pass, total);
});

test.serial('dns.host tests', async (t) => {
  const availableDomains = testTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'unknown',
  }));
  const unavailableDomains = testTlds.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { only: ['dns.host'] });
  t.true(pass / total > 0.95);
});

test.serial('rdap tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping rdap tests due to lack of network access');
    t.pass();
    return;
  }
  const availableDomains = testTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = testTlds.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains, { only: ['rdap'] });
  t.true(pass / total > 0.9);
});

test.serial('checkBatch tests', async (t) => {
  if (!(await hasNetwork())) {
    t.log('Skipping checkBatch tests due to lack of network access');
    t.pass();
    return;
  }
  const availableDomains = testTlds.map((tld) => ({
    name: `this-domain-should-not-exist-12345.${tld}`,
    availability: 'available',
  }));
  const unavailableDomains = testTlds.map((tld) => ({
    name: unavailableMap[tld],
    availability: 'unavailable',
  }));
  const domains = [...availableDomains, ...unavailableDomains];
  const { pass, total } = await runTest(domains);
  t.true(pass / total > 0.9);
});

