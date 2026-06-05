# Static analysis — inventory, then confirm

The scan is **high-recall, low-precision** on purpose. It finds every candidate
from the source; it cannot prove an `await` is top-level vs nested, nor that a
read is covered by a `<Suspense>` in an **ancestor layout**. So the flow is:
`scan.mjs` produces candidates → **you read** the flagged file + its ancestor
layouts to confirm → you map the confirmed site to a lever. The `next build` on
canary is the final arbiter.

## 1. Run the scan

```bash
node skills/next-dynamic-io-refactor/scan.mjs <appRoot>            # report
node skills/next-dynamic-io-refactor/scan.mjs <appRoot> --json     # inventory
```

`<appRoot>` is the project root or the `app/` dir. Output: the **route table**
(every page segment, whether it has dynamic params, `generateStaticParams`,
`loading.tsx`, parallel slots) and **candidate flags** by severity.

## 2. The route-tree model

Cache Components decides static-vs-dynamic at the **route-document** level, so
the tree shape matters as much as any single read:

- A **dynamic param with no `generateStaticParams`** makes the segment a
  _fallback route_ — params are deferred to request time for the **whole
  subtree**, even params that _are_ enumerable higher up. This is why a single
  un-enumerated `[slug]` deep in the tree can keep an entire branch dynamic.
- **A top-level `await` in a layout** gates every page under it. Layouts are the
  highest-leverage place to fix — one deferral can lift a whole subtree.
- **Parallel slots (`@slot`)** are independent boundaries: an uncovered read in
  _any_ slot blocks the navigation; a slot that renders `null` is free.
- **Route groups `(group)`** don't affect the URL but do share a `layout.tsx`.

Read the table top-down: fix layouts and un-enumerated params before leaf reads.

## 3. The dynamic-IO site taxonomy

Every site the scan reports is one of these. The right column is the question
from the framework that resolves it (recipes in `levers.md`).

| Site kind            | What it is                                                | Resolve with                                                              |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `request-api`        | `cookies()` `headers()` `draftMode()` `connection()`      | push down behind `<Suspense>`; never cache it                             |
| `await-params`       | `await params` / `props.params` then-chain                | root-param + `generateStaticParams` (enumerable) **or** pass promise down |
| `await-searchParams` | `await searchParams`                                      | always behind `<Suspense>` (never build-known)                            |
| `useSearchParams`    | client hook                                               | fine on client nav; needs a boundary for page load                        |
| `fetch` / `db`       | uncached network / DB read                                | `'use cache'` (shared) **or** `<Suspense>` (per-request)                  |
| `await-import`       | dynamic import of data                                    | same as fetch/db                                                          |
| `nondeterministic`   | `Math.random` `Date.now` `crypto.randomUUID` `new Date()` | `connection()` + `<Suspense>` (per-request) **or** `'use cache'` (fixed)  |

## 4. Confirm each flag (the precise step the scan can't do)

For a flagged site, open the file and answer three questions by reading:

1. **Is the read actually top-level (gating), or already pushed down?**
   - Top-level = it runs in the component body _before_ the JSX `return`, in the
     default-exported `page`/`layout`/`template`. That blocks everything the
     component renders.
   - Pushed-down = it runs inside a child component that is itself wrapped in
     `<Suspense>`. That's already correct — clear the flag.

2. **Is there a `<Suspense>` ancestor?** The scan only sees boundaries in the
   _same file_. Walk **up** the segment's layouts (`app/.../layout.tsx`,
   parent groups, the root layout): a read can be legitimately covered by a
   boundary in an ancestor. To find ancestors for `app/a/b/page.tsx`, check
   `app/a/b/layout.tsx`, `app/a/layout.tsx`, `app/layout.tsx`.
   - On a **client navigation**, only segments below the nearest shared layout
     re-render — so a boundary must sit **below the shared layout**, not only at
     the root, to cover sibling navs. (`levers.md` → granularity.)

3. **Same-for-all-users, or per-request?** Decides `'use cache'` vs `<Suspense>`:
   - Shared & rarely-changing (product, blog post, nav) → `'use cache'`; it joins
     the shell.
   - Per-user / must-be-fresh (session, cart, live inventory) → leave uncached
     behind a `<Suspense>`; it streams.
   - Reads `cookies()`/`headers()`/`searchParams` → **cannot** be cached; stream.

## 5. Reading the flags

| Flag code                               | Means                                            | Before clearing/acting, confirm                                                                    |
| --------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `dynamic-read-no-boundary-in-file`      | request/param read, no `<Suspense>` in this file | no ancestor layout covers it (step 4.2)                                                            |
| `top-level-await`                       | `await` before the JSX return                    | it reads request/uncached data (a `await fetch` of cached data via a `'use cache'` helper is fine) |
| `dynamic-param-no-generateStaticParams` | fallback route                                   | params aren't already consumed only behind `<Suspense>`; enumerable → add gsp                      |
| `request-data-in-use-cache`             | file-level `'use cache'` + request API           | it's truly in the cached scope (read the function)                                                 |
| `uncached-io-no-boundary`               | uncached fetch/db, no boundary, no cache         | whether the data is shared (cache) or per-request (Suspense)                                       |
| `blank-or-missing-fallback`             | `fallback={null}`/none                           | the child renders nothing on success — else it's a blank-shell bug                                 |
| `coarse-loading-file`                   | `loading.tsx` suspends whole segment             | the segment is mostly static → decompose into per-region boundaries                                |

A flag is **not** a defect — it's "look here." Correctly-structured Cache
Components code produces few or no HIGH flags (verified against the framework's
own fixtures). A clean scan + a clean canary build is the bar.

## 6. ripgrep fallback (no Node)

The same inventory, by hand, when you can't run the script:

```bash
# route tree
fd -e tsx -e ts -e jsx -e js '^(page|layout|template|loading|default)\.' app

# dynamic-IO sites
rg -n -e '\b(cookies|headers|draftMode|connection)\s*\(' \
      -e 'await\s+\w*\.?(params|searchParams)' \
      -e '\bfetch\s*\(' -e 'Math\.random|Date\.now|crypto\.randomUUID' app

# boundaries, directives, generateStaticParams
rg -n '<Suspense' app
rg -n "['\"]use cache" app
rg -ln 'generateStaticParams' app
```

Then apply steps 2–5 by reading. The script is just this, structured.

## 7. Hand off to the levers

For each confirmed site, name the lever (`levers.md`), propose the edit in plan
mode, apply, and **re-run `next build` on canary**. Build errors are the
remaining work list; the route table climbing toward `○`/`◐` is the progress
bar.
