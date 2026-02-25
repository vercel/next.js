# Plan: Change `unstable_staleTime` from number to `{ dynamic?, static? }` object

## Context

Currently `export const unstable_staleTime = 300` accepts a single number that overrides the global `staleTimes.static` config for that page. We want to change it to accept an object `{ dynamic?: number, static?: number }` that mirrors the global `staleTimes` config shape, allowing pages to independently override the static and dynamic stale times.

**Key insight**: The existing `workUnitStore.stale` field doesn't need to change type. The switch statement in `create-component-tree.tsx` already distinguishes between prerender stores (where we'd use the `static` value) and request stores (where we'd use the `dynamic` value). We just set the right value from the object based on the store type.

## Step 1: Update the Zod schema

**File:** `packages/next/src/build/segment-config/app/app-segment-config.ts`

Change the schema from:
```typescript
unstable_staleTime: z.number().int().nonnegative().optional()
```
to:
```typescript
unstable_staleTime: z.object({
  dynamic: z.number().int().nonnegative().optional(),
  static: z.number().int().nonnegative().optional(),
}).optional()
```

Also update:
- The type definition (~line 266): `unstable_staleTime?: { dynamic?: number, static?: number }`
- The error message (~line 188): Update the message for the new shape

## Step 2: Update `create-component-tree.tsx`

**File:** `packages/next/src/server/app-render/create-component-tree.tsx`

Change from:
```typescript
if (isPage && typeof layoutOrPageMod?.unstable_staleTime === 'number') {
  const staleTime = layoutOrPageMod.unstable_staleTime
  // ...
  workUnitStore.stale = staleTime
```
to checking for the object shape:
```typescript
if (isPage && layoutOrPageMod?.unstable_staleTime != null) {
  const staleTimeConfig = layoutOrPageMod.unstable_staleTime
  // ...
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime':
    case 'prerender-legacy':
    case 'prerender-ppr':
    case 'validation-client':
      // Static prerender: use static staleTime
      if (typeof staleTimeConfig.static === 'number') {
        workUnitStore.stale = staleTimeConfig.static
      }
      break
    case 'request':
      // Dynamic navigation: use dynamic staleTime
      if (typeof staleTimeConfig.dynamic === 'number') {
        workUnitStore.stale = staleTimeConfig.dynamic
      }
      break
    // cache/private-cache/prerender-client/unstable-cache: break (no change)
  }
}
```

This means prerender stores get the `static` value and request stores get the `dynamic` value, without changing the store type definition at all.

## Step 3: Update `extract-stale-time-from-loader-tree.ts`

**File:** `packages/next/src/server/app-render/extract-stale-time-from-loader-tree.ts`

Change return type from `Promise<number | undefined>` to `Promise<{ dynamic?: number, static?: number } | undefined>`. Read the object shape from the module instead of a single number.

## Step 4: Update `app-render.tsx` fallback extraction sites

**File:** `packages/next/src/server/app-render/app-render.tsx`

Two places call `extractStaleTimeFromLoaderTree`:

1. **~Line 716** (`generateDynamicFlightRenderResult`): This is for dynamic pages (`requestStore`). Extract `.dynamic`:
   ```typescript
   if (requestStore.stale === undefined) {
     const extracted = await extractStaleTimeFromLoaderTree(...)
     if (typeof extracted?.dynamic === 'number') {
       requestStore.stale = extracted.dynamic
     }
   }
   ```

2. **~Line 5218** (cacheComponents fallback): This is for prerender stores. Extract `.static`:
   ```typescript
   if (finalServerPrerenderStore.stale === INFINITE_CACHE) {
     const extracted = await extractStaleTimeFromLoaderTree(tree)
     if (typeof extracted?.static === 'number') {
       finalServerPrerenderStore.stale = extracted.static
     }
   }
   ```

## Step 5: Update test fixtures

**File:** `test/e2e/app-dir/segment-cache/stale-time-export/app/stale-5-minutes/page.tsx`

Change from:
```typescript
export const unstable_staleTime = 300
```
to:
```typescript
export const unstable_staleTime = { static: 300 }
```

**File:** `test/e2e/app-dir/segment-cache/stale-time-export/app/page.tsx`

Update the description text (currently mentions "does NOT use cacheComponents" which is outdated).

## Step 6: Update the layout build error test

**File:** `test/e2e/app-dir/segment-cache/stale-time-export/stale-time-export.test.ts`

In the layout error test, update the patched layout export from:
```typescript
export const unstable_staleTime = 60
```
to:
```typescript
export const unstable_staleTime = { static: 60 }
```

## Step 7: Update existing test + add new test cases

**File:** `test/e2e/app-dir/segment-cache/stale-time-export/stale-time-export.test.ts`

The existing test ("overrides global staleTimes config") tests the **static** staleTime via prefetch behavior. Update it to work with the new object shape (the fixture change in Step 5 handles most of this, just update comments).

Add new test cases to cover:
- `{ dynamic: N }` — only dynamic override (on a dynamic page via navigation)
- `{ static: N, dynamic: M }` — both overrides
- Verify that unset fields fall back to the global config

This will need new fixture pages (e.g., a dynamic page that uses `cookies()` or similar to force dynamic rendering).

## Files to modify (summary)

1. `packages/next/src/build/segment-config/app/app-segment-config.ts` — schema + type
2. `packages/next/src/server/app-render/create-component-tree.tsx` — read object, set per store type
3. `packages/next/src/server/app-render/extract-stale-time-from-loader-tree.ts` — return object
4. `packages/next/src/server/app-render/app-render.tsx` — update 2 fallback extraction sites
5. `test/e2e/app-dir/segment-cache/stale-time-export/app/stale-5-minutes/page.tsx` — fixture
6. `test/e2e/app-dir/segment-cache/stale-time-export/app/page.tsx` — description text
7. `test/e2e/app-dir/segment-cache/stale-time-export/stale-time-export.test.ts` — tests

## Verification

1. `pnpm --filter=next build` to rebuild
2. Run tests in both modes:
   - `NEXT_SKIP_ISOLATE=1 pnpm test-start-turbo test/e2e/app-dir/segment-cache/stale-time-export/`
   - `__NEXT_CACHE_COMPONENTS=true NEXT_SKIP_ISOLATE=1 pnpm test-start-turbo test/e2e/app-dir/segment-cache/stale-time-export/`
