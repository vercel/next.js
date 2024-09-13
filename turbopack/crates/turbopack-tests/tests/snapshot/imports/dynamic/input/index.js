import("./vercel.mjs").then(console.log);
import(/* webpackIgnore: false */ "./vercel.mjs").then(console.log);
console.log(require("./vercel.cjs"));

// turbopack shouldn't attempt to bundle these, and they should be preserved as dynamic esm imports
// in the output
import(/* webpackIgnore: true */ "./ignore.mjs");
import(/* turbopackIgnore: true */ "./ignore.mjs");

// this should work for cjs requires too
import("./vercel.mjs").then(console.log);
require(/* webpackIgnore: true */ "./ignore.cjs");
require(/* turbopackIgnore: true */ "./ignore.cjs");
