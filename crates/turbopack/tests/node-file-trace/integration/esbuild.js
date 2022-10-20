const { buildSync } = require("esbuild");
const { join } = require("path");

const entry = join(__dirname, "..", "package.json");

const result = buildSync({
  entryPoints: [entry],
  write: false,
});

if (!result) {
  throw new Error("esbuild failed");
}
