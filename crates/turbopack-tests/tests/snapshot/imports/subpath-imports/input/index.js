import foo from "#foo";
import dep from "#dep";
import pattern from "#pattern/pat.js";
import conditionalImport from "#conditional";
const conditionalRequire = require("#conditional");

console.log(foo, dep, pattern, conditionalImport, conditionalRequire);
