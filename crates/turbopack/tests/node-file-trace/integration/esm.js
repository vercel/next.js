require = require("esm")(module);
const assert = require("assert");
assert.equal(require("./fixtures/es-module.js").p, 5);
