/**
 * Emit the JSON Schema for a custom catalog file (an array of probes), derived
 * from the same zod schema the loader validates against. Wire it into your editor
 * for autocomplete + validation when authoring a `--catalog` JSON file:
 *
 *   mira-harness schema > catalog.schema.json
 *   # then map it in VS Code settings: "json.schemas": [{ "fileMatch": ["*catalog*.json"], "url": "./catalog.schema.json" }]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { CatalogSchema } from "../catalog.js";

export interface SchemaOptions {
  out?: string;
}

export function schema(opts: SchemaOptions = {}): void {
  const json = JSON.stringify(z.toJSONSchema(CatalogSchema), null, 2);
  if (opts.out) {
    const dest = resolve(process.cwd(), opts.out);
    writeFileSync(dest, `${json}\n`, "utf8");
    console.error(`wrote catalog JSON Schema to ${opts.out}`);
  } else {
    console.log(json);
  }
}
