import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../dist/index.js";

test("flags a known NIRA premium .ng domain", async () => {
  const result = await check("1net.ng", { cache: false });
  assert.equal(result.fineStatus, "premium");
});

test("flags a known NIRA premium .ng domain case-insensitively", async () => {
  const result = await check("1NET.ng", { cache: false });
  assert.equal(result.fineStatus, "premium");
});

test("does not flag a non-premium .ng domain", async () => {
  const result = await check("example.ng", { cache: false });
  assert.notEqual(result.fineStatus, "premium");
});

test("does not flag a domain outside the .ng TLD", async () => {
  const result = await check("example.com", { cache: false });
  assert.notEqual(result.fineStatus, "premium");
});
