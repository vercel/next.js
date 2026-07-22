# Fake stack frame semantics

In development, React's Flight client evals a small script per revived stack
frame so that debuggers can bind the frames of revived errors to something
resolvable. This directory exercises that machinery end-to-end without a
bundler or a dev server, so its behavior can be covered exhaustively and
iterated on in milliseconds.

## Pieces

- `react-flight-semantics.js` — verbatim copies of the participating React
  Flight pieces (producer: stack capture, filtering, devirtualization, error
  serialization; consumer: fake function creation, error revival including
  `cause` and `AggregateError`, owner task chains).
  `fake-stack-frames.test.ts` verifies token-identity of the copies against
  the vendored React builds, so a React sync that changes them fails the
  suite until the copies are updated.
- `scenario.js` — one scenario per process, run with `--enable-source-maps`
  like `next dev` runs the server. Every participating Next.js piece is the
  real `next/dist` module: `findSourceMapURLDEV`, `filterStackFrameDEV`,
  `patchErrorInspectNodeJS` with the real SWC code frame renderer installed
  (`installCodeFrameSupport` after `loadBindings`, like dev initialization),
  `createReactServerErrorHandler` as the producer's `onError` (real
  `stringHash` digests, well-known-error short-circuits, cross-boundary
  dedup, `formatServerError`), `applyOwnerStack`, and the dev overlay's
  `getOriginalStackFrames`/`parseStack`. Chunk fixtures are real compiled
  output: authored original sources go through SWC (like `next dev`
  compiles modules) and the compiled module is offset inside the chunk by
  line-shifting its map, the way bundlers concatenate — so mappings have
  real density and shape (their generated positions in snapshots move when
  the vendored SWC changes, which is a diff worth seeing). Only the
  fixtures whose subject is the map or cache shape itself (evals, HMR
  updates, index map sections, sparse mappings) stay synthetic. Chunks load
  through real `require()`/`import()`, and an in-process `node:inspector`
  session provides the debugger's view (`Debugger.scriptParsed`, and
  `Runtime.getExceptionDetails` for the `console.createTask` chain a
  debugger shows as the async part of a revived error's stack). A Flight
  boundary is elided to the calls React makes around it: `emitErrorChunk`
  on the producer, `resolveErrorDev` on the consumer. Because digests are
  computed from the stack on the first serialization and carried by revived
  errors, the first hop parses the materialized stack string while later
  hops parse V8's structured stack trace; and each hop revives in a
  separate copy of the Flight client module (the RSC and SSR layers bundle
  their own), placed under a `node_modules` directory and dispatched from
  an empty task so that the revival machinery below the fake frames is
  filtered on the next serialization, like the real Flight client's.

## Coverage dimensions

Scenarios vary one dimension at a time from the `one-hop` baseline (a named
function in a CJS chunk with a plain sibling source map, revived once):

- **Frame shape** — named function, method, constructor, native
  (`Array.map (<anonymous>)`), module evaluation (`Object.<anonymous>`),
  async (leading-space name), deep recursion, eval origin without a
  sourceURL, `new Promise` (filtered), message lines that parse as frames.
- **Chunk shape** — CJS file, eval with a sourceURL and inline source map,
  repeated evals under one sourceURL, a stack spanning two chunks, files
  deleted after loading, code under `node_modules`. Every chunk-loading
  scenario runs as both CJS and ES module (frames carry paths vs
  percent-encoded `file://` URLs, so e.g. the percent-encoding defects are
  CJS-only), snapshotted side by side.
- **HMR shapes** — repeated evals under one sourceURL, an edited chunk file
  behind a busted module cache (both resolve revivals through the stale
  first map), and query-busted ES module reloads (each version resolves
  through its own map).
- **Source map shape** — real compiled (dense), sparse (splitting the
  terminal and debugger consumers), index map with an empty top-level `sources`
  (Turbopack), index map with relative section sources, spec-conformant
  index map, multi-section index map, invalid, missing, fully and partially
  ignore-listed.
- **Path shape** — plain, brackets, space, unicode, percent, hash, symlink,
  a directory name containing `node_modules`, `webpack-internal:` URLs.
- **Hops** — one, two, three, one serialization revived by two consumers,
  the "use cache" layer topology (a `Cache`-rooted consumer for the first
  revival, a `Server`-rooted one for the second), nested "use cache" (two
  `Cache`-rooted consumers in a row), and the instant validation chain (a
  segment re-encode whose `onError` forwards digests, then the dev
  overlay's `{ errors }` payload where the error crosses as a value and
  loses its digest).
- **Error shape** — `Error`, custom `name`, multi-line message, empty
  message (fallback message on revival), thrown non-Error string and
  object, a `cause` chain (including a non-object innermost cause and a
  cause carrying its own environment), `AggregateError`, a pre-digested
  framework error (structured first-hop parse, banner-first fake scripts),
  a message rewritten by `formatServerError` after the digest.
- **Terminal formatting** — resolved frames, ignore-listed collapsing and
  the `__NEXT_SHOW_IGNORE_LISTED` escape hatch, webpack export helper
  renames.
- **Downstream and upstream Next machinery** (real `next/dist` modules) —
  the dev overlay's `/__nextjs_original-stack-frames` resolution
  (`getOriginalStackFrames` with the native source map path and SWC code
  frames), the browser-facing `/__nextjs_source-map` endpoint
  (`getSourceMapMiddleware`) both queried directly and closed into a loop
  with the real browser-side `findSourceMapURL` (fake scripts carry `http:`
  map URLs that resolve through the middleware, and the harness's own
  frames pin the empty answers the endpoint gives for unmapped files),
  browser console logs mapped server-side for the terminal
  (`getSourceMappedStackFrames`, `getConsoleLocation`, `withLocation` over
  a browser-shaped stack with an extension frame, an unmapped chunk, and a
  fake frame of a revived error, which devirtualizes to its server path),
  and `applyOwnerStack` rewriting an error's stack with owner frames before
  serialization.
- **Digest identity** — hashed, `@Exxx` error-code-suffixed, forwarded
  across hops and segment re-encodes, dropped on value crossings, colliding
  for identical throws (the shared map keeps the first error).
- **Owner chain** — none, a two-level component chain, an owner from a
  different environment in both directions (task labels), an owner attached
  only at re-serialization, an owner without a stack, an owner whose stack
  filters away, and `Prerender`/`Prefetch`-stage chains under a
  `Server`-rooted consumer (the `"use ..."` boundary tasks).

## What is deliberately not modeled

- Console replay (`initializeFakeStack` and the `initializeFakeTask`
  consumers other than error revival: await/IO debug info, and with it the
  `useEnclosingLine` variants of `createFakeFunction`). Its one effect on
  the error path — serializing an error as a debug value first caches a
  structured stack parse that the error serialization reuses, flipping the
  first hop off the materialized-string path — is covered.
- The Flight stream: outlined rows are serialized to row text eagerly
  (instead of by the streaming renderer's task queue) and seeded into the
  real chunk cache as resolved model chunks (instead of arriving through
  `processFullStringRow`). The error row itself round-trips as row text, and
  the harness parses it like the client's `E`-row handler.
- The browser's actual HTTP transport: the client `findSourceMapURL` and
  the endpoint middleware are real and wired together, but the fetch
  between them is the harness, not a network stack, and the client-chunk
  shortcut branch (returning `filename + '.map'` for `/_next/static` URLs)
  never fires because fake frames carry server paths.
- Abort and halt wire semantics: render-type aborts emit one shared error
  chunk for the abort reason (owner-less, digest from `onError`), prerender
  aborts halt rows without emitting stacks at all.
- Next machinery around the boundary that swaps or rewrites stacks outside
  serialization: `createHTMLErrorHandler` recovering the original error by
  digest during SSR, and `addErrorContext` (not exported; its
  component-stack rewrite has the same shape as the covered
  `applyOwnerStack`).
- The webpack overlay middleware (needs a webpack compilation) and the
  Turbopack bundler fallbacks (`project.traceSource` in the middleware and
  in the browser-log mapping): only the native source map paths are
  covered.
- The overlay payload's `errorCodes` Map (keyed by error object identity,
  relying on the chunk cache preserving it) and `deobfuscateText` rewriting
  Turbopack magic identifiers in logged messages
  (`setup-dev-bundler.ts`).

## Coverage of the Next.js pieces

Running the suite with `NODE_V8_COVERAGE` over the scenario processes shows
every logic branch of `source-maps.ts`, `patch-error-inspect.ts`,
`create-error-handler.ts`, `format-server-error.ts`, and `parse-stack.ts`
executing, except: the edge runtime variants (`noSourceMap`,
`patchErrorInspectEdgeLite`), production-only branches (`NODE_ENV` gates,
the error-swap in the digest recovery), tracing spans (need an active
tracer), the invalid-source-map `catch` blocks around `module.findSourceMap`
(it does not throw on current Node.js; the terminal's consumer-side catch
is covered through a bundler-provided invalid map), and runs of multiple
consecutive anonymous native frames in the sandwich ignore-listing.

## Universal invariants

Beyond the per-scenario snapshots, every run is checked against invariants
in both directions: every `about://React/` fake script must carry a
parseable inline source map, every fake frame must resolve through it, and
no terminal output may show a raw `about://React/` URL — except for known
defects a test declares inline at its `runScenario` call, which must keep
reproducing until fixed (fixing one fails the suite until the declaration
is removed).

The assertions in `fake-stack-frames.test.ts` encode the current behavior,
including its defects (for example: the second revival of a stack whose chunk
path contains characters that `encodeURI` escapes produces a fake script
without a source map, under the chunk's own URL). Changes to the machinery
are expected to show up as assertion changes there.
