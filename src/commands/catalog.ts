/**
 * List the experiment catalog without sending anything (also powers `loop --list`).
 */
import { CATEGORIES, probesFor } from "../catalog.js";
import { c, note } from "../ui.js";

export function listCatalog(category?: string): void {
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    note(c.red(`unknown category "${category}" (one of: ${CATEGORIES.join(", ")})`));
    process.exit(1);
  }
  const probes = probesFor(category);
  note(c.bold(`${probes.length} probe(s)${category ? ` [${category}]` : ""}`));
  for (const p of probes) {
    const tags = [p.slow ? c.yellow("slow") : "", p.confirm ? c.magenta("confirm") : ""]
      .filter(Boolean)
      .join(" ");
    note(`  ${c.cyan(p.id.padEnd(16))} ${c.dim(p.category.padEnd(11))} ${p.hypothesis} ${tags}`);
  }
}
