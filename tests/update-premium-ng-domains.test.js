import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractDomains, planUpdate } from '../scripts/update-premium-ng-domains.mjs';

test('extractDomains pulls domains out of table cells, deduped and lowercased', () => {
  const html = `
    <table>
      <tr><td>able.ng</td></tr>
      <tr><td>ABLE.ng</td></tr>
      <tr><td>cloth.i.ng</td></tr>
      <tr><td>not a domain</td></tr>
    </table>
  `;
  assert.deepEqual(extractDomains(html), new Set(['able.ng', 'cloth.i.ng']));
});

test('planUpdate reports added and removed domains', () => {
  const current = ['a.ng', 'b.ng', 'c.ng'];
  const scraped = new Set(['b.ng', 'c.ng', 'd.ng']);
  const result = planUpdate(current, scraped);
  assert.deepEqual(result.added, ['d.ng']);
  assert.deepEqual(result.removed, ['a.ng']);
  assert.deepEqual(result.updated, ['b.ng', 'c.ng', 'd.ng']);
});

test('planUpdate refuses an empty scrape', () => {
  assert.throws(() => planUpdate(['a.ng'], new Set()), /scraped 0 domains/);
});

test('planUpdate refuses a removal count over the limit', () => {
  const current = ['a.ng', 'b.ng', 'c.ng'];
  const scraped = new Set(['a.ng']);
  assert.throws(() => planUpdate(current, scraped, { maxRemovals: 1 }), /2 domains would be removed/);
});
