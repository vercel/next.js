
// PACK-3895: ensure that negative lookaround works.
let ctx = require.context("./deps", true, /foo(?!_test)/);
// import all the matches, should just get foo.js
ctx.keys().forEach(ctx);

