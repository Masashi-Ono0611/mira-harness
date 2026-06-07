/**
 * List the experiment catalog without sending anything (also powers `loop --list`).
 */
import { CATALOG, CATEGORIES, loadCatalog, probesFor, type Probe } from "../catalog.js";
import { c, note } from "../ui.js";

export interface CatalogOptions {
  category?: string;
  max?: number;
  json?: boolean;
  /** Custom catalog file (JSON); falls back to the built-in CATALOG. */
  catalog?: string;
}

export function listCatalog(opts: CatalogOptions = {}): void {
  const source: Probe[] = opts.catalog ? loadCatalog(opts.catalog) : CATALOG;
  // Only validate against built-in categories when using the built-in catalog;
  // custom catalogs may define any category string.
  if (!opts.catalog && opts.category && !CATEGORIES.includes(opts.category as (typeof CATEGORIES)[number])) {
    note(c.red(`unknown category "${opts.category}" (one of: ${CATEGORIES.join(", ")})`));
    process.exit(1);
  }
  let probes = probesFor(opts.category, source);
  if (opts.max !== undefined) probes = probes.slice(0, opts.max);

  if (opts.json) {
    console.log(
      JSON.stringify(
        probes.map((p) => ({
          id: p.id,
          category: p.category,
          hypothesis: p.hypothesis,
          send: p.send,
          slow: Boolean(p.slow),
          confirm: Boolean(p.confirm),
        })),
        null,
        2,
      ),
    );
    return;
  }

  note(c.bold(`${probes.length} probe(s)${opts.category ? ` [${opts.category}]` : ""}`));
  for (const p of probes) {
    const tags = [p.slow ? c.yellow("slow") : "", p.confirm ? c.magenta("confirm") : ""]
      .filter(Boolean)
      .join(" ");
    note(`  ${c.cyan(p.id.padEnd(16))} ${c.dim(p.category.padEnd(11))} ${p.hypothesis} ${tags}`);
  }
}
