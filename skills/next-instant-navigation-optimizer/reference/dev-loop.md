# Dev-time diagnosis loop

The fast inner loop for phase D: diagnose and fix shell blockers interactively
against `next dev`, with screenshot deltas as feedback. The production-build
test (phases A–C, F) remains the verdict; dev behavior differs (see caveats).
Two loops, shared levers and primitives, different diagnostics:

- **Page-render loop** ([dev-ppr-loop.md](./dev-ppr-loop.md)) — grow the static shell of a single page. Rank Suspense fallback areas on a shell-only render.
- **Nav loop** ([dev-nav-loop.md](./dev-nav-loop.md)) — when the user clicks a link from A to B, show B's static layout immediately (layout UI, structure, content-shaped fallbacks) instead of holding A's UI until B's data resolves. Capture B's suspended boundaries post-`pushstate`, classify each by `suspended_by[].name`, drop SSR-only client hooks.

Pick one and run it end-to-end.

## requires

**If `next-dev-loop` is not installed and initiated, do not attempt the dev loop — return to phases D–G and use the production-build verdict.** This loop is an optional accelerator, not part of a stock Next.js install: it needs tooling installed separately from the project, and a version bump alone does not enable it. The same applies when any other requirement below is missing.

- `next-dev-loop` initiated for this session — the separate sibling skill that opens the headed browser, exposes the `agent-browser` CLI, and wires the dev MCP server providing `mcp get_logs`. Neither the skill nor that MCP server ships with a base Next.js project.
- The `next-dev-loop` hard floors: Next.js **16.3+** with **Turbopack** and `agent-browser` **>= 0.27.0**. Below these the dev loop cannot run; gate before entering rather than discovering the wall mid-loop.
- `cacheComponents: true` in `next.config.ts`. Refuse otherwise.

## preflight (shared)

1. Confirm `cacheComponents: true`.
2. **The user must already be at the page each loop needs** in the headed browser (from `next-dev-loop`) — logged in, with any state set up. This loop cannot drive auth, SSO, or MFA; it takes the manual setup as the starting point. (Each sub-loop names which page it expects.)
3. `agent-browser get url` to anchor the current route.

Each loop sets the instant cookie as needed (see the shared `instant cookie` section below).

## instant cookie (shared)

Both loops use the `next-instant-navigation-testing` cookie to freeze the framework's dynamic-data writes. Once set, visible content on the page is the static shell + Suspense fallbacks — the state captured to assess the optimization.

Set it with a pending-lock tuple `[0, "<unique-id>"]`. The id is any unique string; the convention is a `p`-prefixed random stamp so concurrent scopes do not collide:

```
agent-browser cookies set next-instant-navigation-testing '[0,"p<random>"]' \
  --url <origin>
```

Each loop's preflight specifies when to set it within the flow. Clear it at the end (see `teardown` below).

## decide which loop

- **Page-render** when the complaint is about one route's initial load. Read [dev-ppr-loop.md](./dev-ppr-loop.md).
- **Nav** when it is about navigating between two routes. Read [dev-nav-loop.md](./dev-nav-loop.md).

When shipping both navigation variants for one route, run dev-ppr-loop for the initial-load target and dev-nav-loop for the soft-nav target in sequence. Only ask the user when the target route itself is ambiguous.

## shared refactor levers

- **Push down** — extract I/O into a Suspense-wrapped child so the parent stays static and static siblings lift into the shell.
  - **Recurse, do not blind-wrap.** If a Suspense boundary already wraps a component containing both static content and the I/O, read inside, extract the I/O-dependent JSX into a new leaf, and lift the static siblings up.
- **Cache** — `'use cache'` + `cacheLife(<profile>)`. Always ask the user for freshness; map to a preset (`seconds` / `minutes` / `hours` / `days` / `weeks` / `max` / `default`).

Push-down and cache compose: push-down lifts static structure, cache eliminates the remaining data gap.

## propose via plan mode (shared)

Each refactor goes through plan mode before applying. The lever and target are mechanical; the edit (which file, how to extract the I/O, where to place the boundary, which `cacheLife` profile) is a judgment call — plan mode forces a coherent proposal and lets the user redirect.

## no-shell bailout (shared)

The levers presume a shell exists to grow or cache toward. If the route is fully blocking — HTTP 500 with `blocking-route` or `NEXT_STATIC_GEN_BAILOUT` in `mcp get_logs`, or zero Suspense boundaries on a visibly-rendered page — there is no shell. Surface the structural blocker and stop; the user must wrap the offending dynamic access in `<Suspense>` before either loop can help.

## verify requires a visible delta (shared)

This visible delta is a diagnostic signal only — not the verdict (the production-build test, line 5, is). Each loop captures a baseline screenshot of the shell before applying any change, then re-screenshots after. Report both paths in the final summary so the user can see what changed. The two captures must visibly differ — fallback area shrunk, content promoted to the static surface, target fallback gone or content-shaped; identical captures (compilation success notwithstanding) mean the refactor did not land — undo.

**Hide the dev overlay before each screenshot.** The Next.js dev overlay (`<nextjs-portal>` at the document root) renders instant-nav guidance, build errors, and other dev overlay UI that pollutes the before/after comparison. Hide it, screenshot, restore:

```
agent-browser eval "document.querySelector('nextjs-portal').style.display='none'"
agent-browser screenshot <path>
agent-browser eval "document.querySelector('nextjs-portal').style.display=''"
```

## anti-patterns (shared)

**Do not replace granular Suspense boundaries with a top-level loading skeleton.** A `loading.tsx` for the whole segment, or a root-level `<Suspense fallback={<Skeleton />}>` — or a `fallback={null}` that renders an empty UI — defeats the optimization, which is to extract the real static layout UI above each granular boundary and use content-shaped fallbacks per region. A coarse page-level loading placeholder bypasses the work entirely.

## caveats (shared)

- Dev does not prefetch the way production does, and routes compile on first hit — so after a navigation or reload, the DOM keeps updating for noticeably longer than the eventual production experience. Wait for the DOM to stabilize before capturing the React tree or taking a screenshot — e.g., poll `document.documentElement.innerHTML.length` until it is unchanged across two consecutive reads. A fixed short delay risks sampling mid-render.
- Do not verify nav prefetch by inspecting dev network traffic — dev does not fire prefetch requests at all, so the network tab, manual `router.prefetch()` calls, and `<Link prefetch={true}>` will all appear non-functional regardless of whether the code is correct. The cookie-locked SPA-nav recipe in [dev-nav-loop.md](./dev-nav-loop.md) under `verify` is the canonical check — it simulates what production would prerender into the prefetched RSC without requiring prefetch to actually fire. Do not substitute a network-tab inspection.
- The diagnose pipeline can be flaky — DevTools attachment timing, DOM-settle races, and dev compilation effects can each produce inconsistent captures from one run to the next. When a result is inconsistent with the expected boundary set (a candidate appears that was not expected, or one that was expected does not), re-run the diagnose 2–3 times and cross-check; boundaries that appear consistently are real, one-off appearances are noise.

## reference (shared primitives)

```
agent-browser react suspense          add --only-dynamic to filter
--json                                server-side to actually-
                                      suspended boundaries. Each
                                      entry has jsx_source +
                                      suspended_by[] with raw blocker
                                      names (usePathname, cookies,
                                      fetch, cache, ...); classify by
                                      name for per-loop rules

POST /__nextjs_original-stack-frames  body { frames: StackFrame[],
                                      isServer, isEdgeServer,
                                      isAppDirectory }; returns one
                                      result per frame with
                                      file:line:column

mcp get_logs                          dev MCP tool from
                                      next-dev-loop; surfaces
                                      blocking-route /
                                      NEXT_STATIC_GEN_BAILOUT 500s

cacheLife('<profile>')                default | seconds | minutes
                                      | hours | days | weeks | max
```

Per-loop primitives in [dev-nav-loop.md](./dev-nav-loop.md).

## teardown (shared)

Delete the cookie by name — overwrite with an expired stamp:

```
agent-browser cookies set next-instant-navigation-testing x \
  --url <origin> --expires 1
```

Never run `agent-browser cookies clear` with no arguments — it clears all cookies, including the authentication session.

---

Sibling of `next-dev-loop` — initiate that first.
