# Root Cause Analysis: Scope Hoisting Circular Import TDZ Error

## Context

The `circular-import-2` test fails with `ReferenceError: Cannot access 'datetimeBase' before initialization` when scope hoisting is enabled. The `circular-import-3` test has the exact same module structure but `"scopeHoisting": false`, confirming this is scope-hoisting-specific. The splitting of `iso.js` and `schemas.js` into different merged groups is fine — the bug is that the runtime behavior differs from the non-merged case.

## Module Graph

```
schemas.js ──import * as iso──→ iso.js
iso.js     ──import * as schemas──→ schemas.js   (circular)
```

- `schemas.js`: imports `iso.js`, calls `iso.datetime()` at top level, then defines `const anyBase = 1234`
- `iso.js`: imports `schemas.js`, defines `const datetimeBase = () => { schemas.anyBase.init() }` and `function datetime() { return datetimeBase }`

## Merged Module Layout

The merger places these modules into different closures:

- **Module 2** factory (IDs: `index.js <locals>`, `iso.js`): contains `<locals>` exports + iso.js code
- **Module 3** factory (IDs: `shared.js`, `schemas.js`, `index.js <export * as z>`): contains shared.js + schemas.js + facade code

Both `iso.js` and `schemas.js` get the same bitmap `{0,1}` during the bitmap partitioning phase. The split happens later in the **reconciliation phase** (`merged_modules.rs:545-692`) because the two chunk groups (entry1, entry2) have different DFS orderings for `errors.js` relative to `<locals>`/`iso.js`:

- Entry1 DFS post-order: `[errors.js, <locals>, iso.js, schemas.js, facade, <export*z>, shared.js]`
- Entry2 DFS post-order: `[<locals>, iso.js, errors.js, schemas.js, facade, <export*z>, shared.js]`

The reconciliation splits at the disagreement point (`errors.js` position), producing: `[<locals>, iso.js]` and `[schemas.js, facade, <export*z>, shared.js]`.

**This splitting is fine** — the bug is in the runtime behavior.

## The Runtime Bug

The bug is in how `instantiateModuleShared` (`hmr-runtime.ts:496`) interacts with merged module factories.

### How module factories are registered

In `installCompressedModuleFactories` (`runtime-utils.ts:546`), ALL module IDs in a merged group are registered with the **same** factory function:

```
moduleFactories.set("shared.js", factory3)
moduleFactories.set("schemas.js", factory3)    // same factory!
moduleFactories.set("<export * as z>", factory3) // same factory!
```

### How instantiation works

In `instantiateModuleShared` (line 550), only the **requested** module ID is cached before the factory runs:

```typescript
devModuleCache[id] = module // only caches "shared.js", NOT "schemas.js"
moduleFactory.call(exports, context, module, exports) // runs the factory
```

### The failure sequence

```
1. entry1 imports "shared.js"
2. getOrInstantiateModuleFromParent("shared.js") → not cached → instantiateModuleShared("shared.js")
3. devModuleCache["shared.js"] = module  ← only "shared.js" cached
4. Module 3 factory runs:
   a. i("errors.js") → instantiated, finishes
   b. i("index.js <locals>") → instantiates Module 2:
      - s([], "index.js <locals>")
      - s(["datetime", ()=>datetime], "iso.js") → registers iso.js in devModuleCache via getOverwrittenModule
      - i("schemas.js") → devModuleCache["schemas.js"] is UNDEFINED!
        → instantiateModuleShared("schemas.js")
        → moduleFactories.get("schemas.js") returns SAME factory3
        → devModuleCache["schemas.js"] = newModule
        → factory3 RE-ENTERS (completely new invocation from the beginning)
5. Module 3 factory RE-ENTERS for schemas.js:
   a. i("errors.js") → cached ✓
   b. i("index.js <locals>") → cached ✓
   c. s(["any","anyBase"], "schemas.js") → registers exports
   d. i("iso.js") → cached (from s() in step 4b) → returns immediately
   e. iso["datetime"]() → datetime() is callable (function decl is hoisted)
      → return datetimeBase → const datetimeBase is at Module 2 line 29
      → Module 2 is stuck at step 4b.i("schemas.js") — line 29 hasn't been reached
      → TDZ ERROR!
```

### Why it works without merging

If iso.js and schemas.js each had their own factory:

```
1. Module 3 factory for shared.js runs
2. s("schemas.js") registers schemas.js in devModuleCache (via getOverwrittenModule)
3. i("iso.js") → iso.js has its OWN factory → instantiateModuleShared("iso.js") runs:
   a. iso.js factory: i("schemas.js") → devModuleCache["schemas.js"] exists → returns partial
   b. iso.js factory: const datetimeBase = ... → INITIALIZED
   c. iso.js factory FINISHES
4. Back to Module 3: iso.datetime() → datetimeBase is initialized → WORKS ✓
```

The critical difference: **with separate factories, `i("iso.js")` runs iso.js's factory to completion before returning.** With merged factories, iso.js's code is in Module 2 alongside `<locals>`, and importing `<locals>` forces iso.js to run prematurely.

### The root cause

**When `instantiateModuleShared` is called for one module ID in a merged group (e.g., "shared.js"), only that ID is registered in `devModuleCache`. The sibling IDs ("schemas.js", "<export \* as z>") that share the same factory are NOT pre-registered.** When a circular dependency targets an unregistered sibling ID, `getOrInstantiateModuleFromParent` doesn't find it in the cache and calls `instantiateModuleShared` again with the same factory — causing a **re-entrant factory invocation** instead of returning a partial module (which is how non-merged circular dependencies work).

### Key files

- Runtime factory registration: `runtime-utils.ts:546` (`installCompressedModuleFactories`)
- Module instantiation: `hmr-runtime.ts:496` (`instantiateModuleShared`, line 550 only caches `id`)
- Import resolution: `nodejs/runtime/dev-base.ts:126` (`getOrInstantiateModuleFromParent`)
- Context.s (esmExport): `runtime-utils.ts:135` (`esmExport` — uses `getOverwrittenModule(this.c, id)` which creates cache entries via `s()` calls)
- Module merging/splitting: `merged_modules.rs`
