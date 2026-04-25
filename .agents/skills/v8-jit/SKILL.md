---
name: v8-jit
description: >
  V8 JIT optimization patterns for writing high-performance JavaScript in
  Next.js server internals. Use when writing or reviewing hot-path code in
  app-render, stream-utils, routing, caching, or any per-request code path.
  Covers hidden classes / shapes, monomorphic call sites, inline caches,
  megamorphic deopt, closure allocation, array packing, and profiling with
  --trace-opt / --trace-deopt.
user-invocable: false
---

# V8 JIT Optimization

Use this skill when writing or optimizing performance-critical code paths in
Next.js server internals — especially per-request hot paths like rendering,
streaming, routing, and caching.

## Background: V8's Tiered Compilation

V8 compiles JavaScript through multiple tiers:

1. **Ignition** (interpreter) — executes bytecode immediately.
2. **Sparkplug** — fast baseline compiler (no optimization).
3. **Maglev** — mid-tier optimizing compiler.
4. **Turbofan** — full optimizing compiler (speculative, type-feedback-driven).

Code starts in Ignition and is promoted to higher tiers based on execution
frequency and collected type feedback. Turbofan produces the fastest machine
code but **bails out (deopts)** when assumptions are violated at runtime.

The key principle: **help V8 make correct speculative assumptions by keeping
types, shapes, and control flow predictable.**

## Hidden Classes (Shapes / Maps)

Every JavaScript object has an internal "hidden class" (V8 calls it a _Map_,
the spec calls it a _Shape_). Objects that share the same property names, added
in the same order, share the same hidden class. This enables fast property
access via inline caches.

### Initialize All Properties in Constructors

```ts
// GOOD — consistent shape, single hidden class transition chain
class RequestContext {
  url: string
  method: string
  headers: Record<string, string>
  startTime: number
  cached: boolean

  constructor(url: string, method: string, headers: Record<string, string>) {
    this.url = url
    this.method = method
    this.headers = headers
    this.startTime = performance.now()
    this.cached = false // always initialize, even defaults
  }
}
```

```ts
// BAD — conditional property addition creates multiple hidden classes
class RequestContext {
  constructor(url, method, headers, options) {
    this.url = url
    this.method = method
    if (options.timing) {
      this.startTime = performance.now() // shape fork!
    }
    if (options.cache) {
      this.cached = false // another shape fork!
    }
    this.headers = headers
  }
}
```

**Rules:**

- Assign every property in the constructor, in the same order, for every
  instance. Use `null` / `undefined` / `false` as default values rather than
  omitting the property.
- Prefer factory functions when constructing hot-path objects. A single factory
  makes it harder to accidentally fork shapes in different call sites.
- Never `delete` a property on a hot object — it forces a transition to
  dictionary mode (slow properties).
- Avoid adding properties after construction (`obj.newProp = x`) on objects
  used in hot paths.
- Object literals that flow into the same function should have keys in the
  same order:
- Use tuples for very small fixed-size records when names are not needed.
  Tuples avoid key-order pitfalls entirely.

```ts
// GOOD — same key order, shares hidden class
const a = { type: 'static', value: 1 }
const b = { type: 'dynamic', value: 2 }

// BAD — different key order, different hidden classes
const a = { type: 'static', value: 1 }
const b = { value: 2, type: 'dynamic' }
```

### Real Codebase Example

`Span` in `src/trace/trace.ts` initializes all fields in the constructor in a
fixed order — `name`, `parentId`, `attrs`, `status`, `id`, `_start`, `now`.
This ensures all `Span` instances share one hidden class.

## Monomorphic vs Polymorphic vs Megamorphic

V8's inline caches (ICs) track the types/shapes seen at each call site or
property access:

| IC State        | Shapes Seen | Speed                                 |
| --------------- | ----------- | ------------------------------------- |
| **Monomorphic** | 1           | Fastest — single direct check         |
| **Polymorphic** | 2–4         | Fast — linear search through cases    |
| **Megamorphic** | 5+          | Slow — hash-table lookup, no inlining |

Once an IC goes megamorphic it does NOT recover (until the function is
re-compiled). Megamorphic ICs also **prevent Turbofan from inlining** the
function.

### Keep Hot Call Sites Monomorphic

```ts
// GOOD — always called with the same argument shape
function processChunk(chunk: Uint8Array): void {
  // chunk is always Uint8Array → monomorphic
}

// BAD — called with different types at the same call site
function processChunk(chunk: Uint8Array | Buffer | string): void {
  // IC becomes polymorphic/megamorphic
}
```

**Practical strategies:**

- Normalize inputs at the boundary (e.g. convert `Buffer` → `Uint8Array`
  once) and keep internal functions monomorphic.
- Avoid passing both `null` and `undefined` for the same parameter — pick one
  sentinel value.
- When a function must handle multiple types, split into separate specialized
  functions and dispatch once at the entry point:

```ts
// Entry point dispatches once
function handleStream(stream: ReadableStream | Readable) {
  if (stream instanceof ReadableStream) {
    return handleWebStream(stream) // monomorphic call
  }
  return handleNodeStream(stream) // monomorphic call
}
```

This is the pattern used in `stream-ops.ts` and throughout the stream-utils
code (Node.js vs Web stream split via compile-time switcher).

## Closure and Allocation Pressure

Every closure captures its enclosing scope. Creating closures in hot loops
or per-request paths generates GC pressure and can prevent escape analysis.

### Hoist Closures Out of Hot Paths

```ts
// BAD — closure allocated for every request
function handleRequest(req) {
  stream.on('data', (chunk) => processChunk(chunk, req.id))
}

// GOOD — shared listener, request context looked up by stream
const requestIdByStream = new WeakMap()
function onData(chunk) {
  const id = requestIdByStream.get(this)
  if (id !== undefined) processChunk(chunk, id)
}

function processChunk(chunk, id) {
  /* ... */
}

function handleRequest(req) {
  requestIdByStream.set(stream, req.id)
  stream.on('data', onData)
}
```

```ts
// BEST — pre-allocate the callback as a method on a context object
class StreamProcessor {
  id: string
  constructor(id: string) {
    this.id = id
  }
  handleChunk(chunk: Uint8Array) {
    processChunk(chunk, this.id)
  }
}
```

### Avoid Allocations in Tight Loops

```ts
// BAD — allocates a new object per iteration
for (const item of items) {
  doSomething({ key: item.key, value: item.value })
}

// GOOD — reuse a mutable scratch object
const scratch = { key: '', value: '' }
for (const item of items) {
  scratch.key = item.key
  scratch.value = item.value
  doSomething(scratch)
}
```

### Real Codebase Example

`node-stream-helpers.ts` hoists `encoder`, `BUFFER_TAGS`, and tag constants to
module scope to avoid re-creating them on every request. The `bufferIndexOf`
helper uses `Buffer.indexOf` (C++ native) instead of a per-call JS loop,
eliminating per-chunk allocation.

## Array Optimizations

V8 tracks array "element kinds" — an internal type tag that determines how
elements are stored in memory:

| Element Kind      | Description                   | Speed                       |
| ----------------- | ----------------------------- | --------------------------- |
| `PACKED_SMI`      | Small integers only, no holes | Fastest                     |
| `PACKED_DOUBLE`   | Numbers only, no holes        | Fast                        |
| `PACKED_ELEMENTS` | Mixed/objects, no holes       | Moderate                    |
| `HOLEY_*`         | Any of above with holes       | Slower (extra bounds check) |

**Transitions are one-way** — once an array becomes `HOLEY` or `PACKED_ELEMENTS`,
it never goes back.

### Rules

- Pre-allocate arrays with known size: `new Array(n)` creates a holey array.
  Prefer `[]` and `push()`, or use `Array.from({ length: n }, initFn)`.
- Don't create holes: `arr[100] = x` on an empty array creates 100 holes.
- Don't mix types: `[1, 'two', {}]` immediately becomes `PACKED_ELEMENTS`.
- Prefer typed arrays only when you need binary interop/contiguous memory or
  have profiling evidence that they help. For small/short-lived collections,
  normal arrays can be faster and allocate less.

```ts
// GOOD — packed SMI array
const indices: number[] = []
for (let i = 0; i < n; i++) {
  indices.push(i)
}

// BAD — holey from the start
const indices = new Array(n)
for (let i = 0; i < n; i++) {
  indices[i] = i
}
```

### Real Codebase Example

`accumulateStreamChunks` in `app-render.tsx` uses `const staticChunks: Array<Uint8Array> = []` with `push()` — keeping a packed array of a single type
throughout its lifetime.

## Function Optimization and Deopts

### Hot-Path Deopt Footguns

- **`arguments` object**: using `arguments` in non-trivial ways (e.g.
  `arguments[i]` with variable `i`, leaking `arguments`). Use rest params
  instead.
- **Type instability at one call site**: same operation sees both numbers and
  strings (or many object shapes) and becomes polymorphic/megamorphic.
- **`eval` / `with`**: prevents optimization entirely.
- **Highly dynamic object iteration**: avoid `for...in` on hot objects; prefer
  `Object.keys()` / `Object.entries()` when possible.

### Favor Predictable Control Flow

```ts
// GOOD — predictable: always returns same type
function getStatus(code: number): string {
  if (code === 200) return 'ok'
  if (code === 404) return 'not found'
  return 'error'
}

// BAD — returns different types
function getStatus(code: number): string | null | undefined {
  if (code === 200) return 'ok'
  if (code === 404) return null
  // implicitly returns undefined
}
```

### Watch Shape Diversity in `switch` Dispatch

```ts
// WATCH OUT — `node.type` IC can go megamorphic if many shapes hit one site
function render(node) {
  switch (node.type) {
    case 'div':
      return { tag: 'div', children: node.children }
    case 'span':
      return { tag: 'span', text: node.text }
    case 'img':
      return { src: node.src, alt: node.alt }
    // Many distinct node layouts can make this dispatch site polymorphic
  }
}
```

This pattern is not always bad. Often the main pressure is at the shared
dispatch site (`node.type`), while properties used only in one branch stay
monomorphic within that branch. Reach for normalization/splitting only when
profiles show this site is hot and polymorphic.

## String Operations

- **String concatenation in loops is usually fine in modern V8** (ropes make
  many concatenations cheap). For binary data, use `Buffer.concat()`.
- **Template literals vs concatenation**: equivalent performance in modern V8,
  but template literals are clearer.
- **`string.indexOf()` > regex** for simple substring checks.
- **Reuse RegExp objects**: don't create a `new RegExp()` inside a hot
  function — hoist it to module scope.

```ts
// GOOD — regex hoisted to module scope
const ROUTE_PATTERN = /^\/api\//

function isApiRoute(path: string): boolean {
  return ROUTE_PATTERN.test(path)
}

// BAD — regex recreated on every call
function isApiRoute(path: string): boolean {
  return /^\/api\//.test(path) // V8 may or may not cache this
}
```

## `Map` and `Set` vs Plain Objects

- **`Map`** is faster than plain objects for frequent additions/deletions
  (avoids hidden class transitions and dictionary mode).
- **`Set`** is faster than `obj[key] = true` for membership checks with
  dynamic keys.
- For **static lookups** (known keys at module load), plain objects or
  `Object.freeze({...})` are fine — V8 optimizes them as constant.
- Never use an object as a map if keys come from user input (prototype
  pollution risk + megamorphic shapes).

## Profiling and Verification

### V8 Flags for Diagnosing JIT Issues

```bash
# Trace which functions get optimized
node --trace-opt server.js 2>&1 | grep "my-function-name"

# Trace deoptimizations (critical for finding perf regressions)
node --trace-deopt server.js 2>&1 | grep "my-function-name"

# Combined: see the full opt/deopt lifecycle
node --trace-opt --trace-deopt server.js 2>&1 | tee /tmp/v8-trace.log

# Show IC state transitions (verbose)
node --trace-ic server.js 2>&1 | tee /tmp/ic-trace.log

# Print optimized code (advanced)
node --print-opt-code --code-comments server.js
```

### Targeted Profiling in Next.js

```bash
# Profile a production build
node --cpu-prof --cpu-prof-dir=/tmp/profiles \
  node_modules/.bin/next build

# Profile the server during a benchmark
node --cpu-prof --cpu-prof-dir=/tmp/profiles \
  node_modules/.bin/next start &
# ... run benchmark ...
# Analyze in Chrome DevTools: chrome://inspect → Open dedicated DevTools

# Quick trace-deopt check on a specific test
node --trace-deopt $(which jest) --runInBand test/path/to/test.ts \
  2>&1 | grep -i "deopt" | head -50
```

### Using `%` Natives (Development/Testing Only)

With `--allow-natives-syntax`:

```js
function hotFunction(x) {
  return x + 1
}

// Force optimization
%PrepareFunctionForOptimization(hotFunction)
hotFunction(1)
hotFunction(2) % OptimizeFunctionOnNextCall(hotFunction)
hotFunction(3)

// Check optimization status
// 1 = optimized, 2 = not optimized, 3 = always optimized, 6 = maglev
console.log(%GetOptimizationStatus(hotFunction))
```

## Checklist for Hot Path Code Reviews

- [ ] All object properties initialized in constructor/literal, same order
- [ ] No `delete` on hot objects
- [ ] No post-construction property additions on hot objects
- [ ] Functions receive consistent types (monomorphic call sites)
- [ ] Type dispatch happens at boundaries, not deep in hot loops
- [ ] No closures allocated inside tight loops
- [ ] Module-scope constants for regex, encoders, tag buffers
- [ ] Arrays are packed (no holes, no mixed types)
- [ ] `Map`/`Set` used for dynamic key collections
- [ ] No `arguments` object — use rest params
- [ ] `try/catch` at function boundary, not inside tight loops
- [ ] String building via array + `join()` or `Buffer.concat()`
- [ ] Return types are consistent (no `string | null | undefined` mixes)

## Related Skills

- `$dce-edge` — DCE-safe require patterns (compile-time dead code)
- `$runtime-debug` — runtime bundle debugging and profiling workflow
