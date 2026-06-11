/**
 * Public library API for mira-harness.
 *
 * Import the core programmatically instead of shelling out to the CLI:
 *
 *   import { connect, sendAndCollect } from "mira-harness";
 *   const client = await connect(process.env.TG_SESSION!);
 *   const result = await sendAndCollect(client, "mira", "What can you do?");
 *
 * The CLI (bin: `mira-harness`) and the MCP server are thin frontends over this.
 */

export {
  type CapturedButton,
  type CapturedLink,
  type CapturedMedia,
  type CapturedMessage,
  extractButtons,
  extractLinks,
  extractMedia,
  extractMessage,
  type ProbeResult,
} from "./capture.js";
export {
  CATALOG,
  CATEGORIES,
  loadCatalog,
  type Probe,
  type ProbeCategory,
  probesFor,
} from "./catalog.js";
export {
  allowedPeers,
  assertAllowed,
  type CollectOptions,
  clickAndCollect,
  connect,
  sendAndCollect,
} from "./client.js";
export { renderReport } from "./commands/report.js";
export { tgEnv } from "./env.js";
export { appendRun, RUNS_FILE, type RunMeta } from "./log.js";
