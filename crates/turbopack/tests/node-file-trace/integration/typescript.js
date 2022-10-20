const { spawn } = require("child_process");
const tsc = require.resolve("typescript/bin/tsc");
const tscjs = require.resolve("typescript/lib/tsc.js");
const cwd = __dirname;

if (!tsc.endsWith("tsc")) {
  throw new Error("Expected tsc cli but found " + tsc);
}

if (!tscjs.endsWith("tsc.js")) {
  throw new Error("Expected tsc.js but found " + tscjs);
}

const child = spawn("node", [tscjs, "--version"], { cwd });
child.stdout.on("data", (data) => {
  if (!data || data.toString().length === 0) {
    throw new Error("Expected stdout output but found none");
  }
});
child.stderr.on("data", (data) => {
  throw new Error("Unexpected stderr output: " + data.toString());
});
