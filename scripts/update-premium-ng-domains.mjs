import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = process.env.PREMIUM_NG_SOURCE_URL || 'https://premium.register.ng/premium_domains';
const OUTPUT_PATH = fileURLToPath(new URL('../src/premium-ng-domains.json', import.meta.url));
const MAX_REMOVALS = 50;

export function extractDomains(html) {
  const domains = new Set();
  for (const [, domain] of html.matchAll(/<td>([a-zA-Z0-9.-]+\.ng)<\/td>/gi)) {
    domains.add(domain.trim().toLowerCase());
  }
  return domains;
}

// Diffs `current` (the existing sorted list) against `scraped` (a Set of
// freshly scraped domains) and returns the sorted result to write, or throws
// if the change looks more like a scrape error than a real pool update.
export function planUpdate(current, scraped, { maxRemovals = MAX_REMOVALS } = {}) {
  // An empty scrape almost certainly means the page structure changed (or
  // the fetch got an error/interstitial page) rather than the pool being
  // genuinely emptied, so refuse rather than wiping the list.
  if (scraped.size === 0) {
    throw new Error('Refusing to update: scraped 0 domains from source (page structure may have changed).');
  }

  const currentSet = new Set(current);
  const added = [...scraped].filter((d) => !currentSet.has(d)).sort();
  const removed = current.filter((d) => !scraped.has(d)).sort();

  // A large swing in removals is more likely a scrape/parsing error than
  // NIRA actually pulling that many domains from the premium pool at once.
  if (removed.length > maxRemovals) {
    throw new Error(
      `Refusing to update: ${removed.length} domains would be removed (limit ${maxRemovals}).\n` +
        `Removed: ${removed.join(', ')}`,
    );
  }

  return { added, removed, updated: [...scraped].sort() };
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${res.status}`);
  }
  const scraped = extractDomains(await res.text());
  const current = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));

  const { added, removed, updated } = planUpdate(current, scraped);

  if (added.length === 0 && removed.length === 0) {
    console.log('No changes: premium-ng-domains.json is already up to date.');
    return;
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(updated, null, 2)}\n`);

  console.log(`Updated premium-ng-domains.json: +${added.length} -${removed.length} (total ${updated.length})`);
  if (added.length) {
    console.log('Added:', added.join(', '));
  }
  if (removed.length) {
    console.log('Removed:', removed.join(', '));
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
