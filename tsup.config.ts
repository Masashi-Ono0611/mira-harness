import { defineConfig } from "tsup";

export default defineConfig({
  // cli.ts = the bin (keeps its own #!/usr/bin/env node shebang, preserved by esbuild);
  // index.ts = the public library entry (with .d.ts types).
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: { entry: "src/index.ts" },
});
