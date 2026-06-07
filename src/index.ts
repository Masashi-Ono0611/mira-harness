/**
 * Public library API for mira-harness.
 *
 * Import the core programmatically instead of shelling out to the CLI:
 *
 *   import { connect, sendAndCollect } from "mira-harness";
 *   const client = await connect(process.env.TG_SESSION!);
 *   const result = await sendAndCollect(client, "mira", "STON_USDT_10");
 *
 * The CLI (bin: `mira-harness`) and the MCP server are thin frontends over this.
 */
export {
  connect,
  sendAndCollect,
  clickAndCollect,
  allowedPeers,
  assertAllowed,
  type CollectOptions,
} from "./client.js";

export {
  extractMessage,
  extractButtons,
  extractLinks,
  extractMedia,
  type CapturedMessage,
  type CapturedButton,
  type CapturedLink,
  type CapturedMedia,
  type ProbeResult,
} from "./capture.js";

export {
  CATALOG,
  CATEGORIES,
  probesFor,
  type Probe,
  type ProbeCategory,
} from "./catalog.js";

export { appendRun, RUNS_FILE, type RunMeta } from "./log.js";
export { tgEnv } from "./env.js";
