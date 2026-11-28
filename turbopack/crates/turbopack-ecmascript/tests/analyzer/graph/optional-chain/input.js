const cfg = { path: './target.js' }

// Not evaluated with an `undefined` alternative, so this isn't a request for "undefined"
require(cfg?.path)
new URL(cfg?.path, import.meta.url)

// The object of a member is `process.env` or `undefined`
console.log(process?.env?.FOO)
