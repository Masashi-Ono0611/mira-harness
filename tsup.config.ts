import { defineConfig } from "tsup";

export default defineConfig({
  // cli.ts = the CLI bin, mcp.ts = the MCP stdio server bin (both keep their own
  // #!/usr/bin/env node shebang, preserved by esbuild); index.ts = the library entry.
  entry: ["src/cli.ts", "src/mcp.ts", "src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: { entry: "src/index.ts" },
});
