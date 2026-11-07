# DCE-safe requires

rule: A Node-only `require('./file')` sits in the dead branch of an `if/else` on a compile-time env, so edge builds can drop it. A bare `if` is fine for an inline `node:*` specifier, but not for a file `require()`.

severity: escalate (medium)

## Signs in review

- A Node-only `require()` behind an early `return` or `throw`
- A bare `if` without `else` around `require('./some-module')` (fine for `require('node:stream')` inline)

## Example

Bad:

```ts
if (!process.env.__NEXT_USE_NODE_STREAMS) return webPath()
const { Readable } = require('node:stream')
```

Good:

```ts
if (process.env.__NEXT_USE_NODE_STREAMS) {
  const { Readable } = require('node:stream')
  // node path
} else {
  // web path
}
```

## Why

Edge routes aren't served from Next's precompiled bundles. The app's own bundler compiles them: Turbopack by default, or webpack for apps that still use it. The code has to be eliminable under both, and webpack is the stricter of the two. It only drops a `require()` in the dead branch of an `if/else` it can evaluate at compile time, with no control-flow analysis of early returns. See `.agents/skills/dce-edge/SKILL.md`.

TODO: add a CI check that builds an edge fixture with Turbopack and webpack and fails if a `node:*` module or a Node-only file ends up in the edge output. Once that exists, drop this rule.
