/**
 * Unit tests for the catalog loader + filter — pure, no network. Run: `npm test`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG, loadCatalog, probesFor } from "../src/catalog.js";

const dir = mkdtempSync(join(tmpdir(), "mh-"));

// 1. valid custom catalog — defaults applied, fields preserved
{
  const file = join(dir, "ok.json");
  writeFileSync(
    file,
    JSON.stringify([
      { id: "a", send: "x" },
      { id: "b", category: "k", hypothesis: "h", send: "y", slow: true, confirm: true },
    ]),
  );
  const probes = loadCatalog(file);
  assert.equal(probes.length, 2);
  assert.equal(probes[0].category, "custom"); // default
  assert.equal(probes[0].hypothesis, ""); // default
  assert.equal(probes[1].category, "k");
  assert.equal(probes[1].slow, true);
  assert.equal(probes[1].confirm, true);

  // probesFor honors a custom source + category filter
  assert.equal(probesFor("k", probes).length, 1);
  assert.equal(probesFor(undefined, probes).length, 2);
  assert.equal(probesFor("nope", probes).length, 0);
}

// 2. missing required `send` -> validation error
{
  const file = join(dir, "bad.json");
  writeFileSync(file, JSON.stringify([{ id: "x" }]));
  assert.throws(() => loadCatalog(file), /invalid catalog/);
}

// 3. not JSON -> clear error
{
  const file = join(dir, "nj.json");
  writeFileSync(file, "{not json");
  assert.throws(() => loadCatalog(file), /not valid JSON/);
}

// 4. empty array -> error
{
  const file = join(dir, "empty.json");
  writeFileSync(file, "[]");
  assert.throws(() => loadCatalog(file), /no probes/);
}

// 5. built-in catalog sanity (expanded set)
assert.ok(CATALOG.length >= 25, `expected >=25 built-in probes, got ${CATALOG.length}`);
assert.ok(probesFor("core").length >= 5);

console.log("catalog.test.ts: all assertions passed ✅");
