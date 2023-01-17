const moduleAlias = require("module-alias");
const os = require("os");

require("./empty");

moduleAlias.addAlias("./example.mdx", __dirname + "/empty.js");

const Example = require("./example.mdx");

const { existsSync } = eval("require")("fs");

if (__dirname.startsWith(os.tmpdir()) && existsSync("./snowfall.jsx")) {
  throw new Error("snowfall.jsx should not exist");
}
