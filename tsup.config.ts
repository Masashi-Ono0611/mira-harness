import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  // The bin must be directly executable.
  banner: { js: "#!/usr/bin/env node" },
});
