---
name: next-cache-components-optimizer
description: >
  Optimize a Next.js app that has `cacheComponents: true` — either the static
  shell on first paint, or the in-app navigation between routes. Picks the
  matching diagnostic loop and runs it.
---

# next-cache-components-optimizer

Two loops, shared levers and primitives, different diagnostics:

- **Page-render loop** ([ppr-loop.md](./ppr-loop.md)) — grow the static shell of a single page. Rank Suspense fallback areas on a shell-only render.
- **Nav loop** ([instant-nav-loop.md](./instant-nav-loop.md)) — when the user clicks a link from A to B, show B's static layout immediately (chrome, structure, content-shaped fallbacks) instead of holding A's UI until B's data resolves. Capture B's suspended boundaries post-`pushstate`, classify each by `suspended_by[].name`, drop SSR-only client hooks.

Pick one and run it end-to-end.

## requires

- `next-dev-loop` initiated for this session — it opens the headed browser, exposes the `agent-browser` CLI, and wires the dev MCP server that provides `mcp get_logs`.
- `cacheComponents: true` in `next.config.ts`. Refuse otherwise.

## preflight (shared)

1. Confirm `cacheComponents: true`.
2. **The user must already be at the page each loop needs** in the headed browser (from `next-dev-loop`) — logged in, with any state set up. This skill can't drive auth, SSO, or MFA; it takes the manual setup as the starting point. (Each sub-loop names which page it expects.)
3. `agent-browser get url` to anchor the current route.

Each loop sets the instant cookie as needed (see the shared `instant cookie` section below).

## instant cookie (shared)

Both loops use the `next-instant-navigation-testing` cookie to freeze the framework's dynamic-data writes. Once set, visible content on the page is the static shell + Suspense fallbacks — that's what we capture to assess the optimization.

Set it with a pending-lock tuple `[0, "<unique-id>"]`. The id is any unique string; the convention is a `p`-prefixed random stamp so concurrent scopes don't collide:

```
agent-browser cookies set next-instant-navigation-testing '[0,"p<random>"]' \
  --url <origin>
```

Each loop's preflight specifies when to set it within the flow. Clear it at the end (see `teardown` below).

## decide which loop

- **Page-render** when the complaint is about one route's initial load. Read [ppr-loop.md](./ppr-loop.md).
- **Nav** when it's about navigating between two routes. Read [instant-nav-loop.md](./instant-nav-loop.md).

Ambiguous → ask.

## shared refactor levers

- **Push down** — extract I/O into a Suspense-wrapped child so the parent stays static and static siblings lift into the shell.
  - **Recurse, don't blind-wrap.** If a Suspense boundary already wraps a component containing both static content and the I/O, read inside, extract the I/O-dependent JSX into a new leaf, and lift the static siblings up.
- **Cache** — `'use cache'` + `cacheLife(<profile>)`. Always ask the user for freshness; map to a preset (`seconds` / `minutes` / `hours` / `days` / `weeks` / `max` / `default`).

Push-down and cache compose: push-down lifts static structure, cache eliminates the remaining data gap.

## propose via plan mode (shared)

Each refactor goes through plan mode before applying. Treat this as a signal: the application work is non-trivial agentic engineering, not a templated edit. This skill provides the framework — which lever to reach for, which candidate to fix, what the expected visible delta is — but the real work (which file to edit, how to cleanly extract the I/O, where to place the new Suspense boundary, which `cacheLife` profile to ask the user for) is a judgment call you have to think through. Plan mode forces a coherent proposal before touching code, and gives the user a chance to redirect on any of those decisions.

## no-shell bailout (shared)

The levers presume a shell exists to grow or cache toward. If the route is fully blocking — HTTP 500 with `blocking-route` or `NEXT_STATIC_GEN_BAILOUT` in `mcp get_logs`, or zero Suspense boundaries on a visibly-rendered page — there's no shell. Surface the structural blocker and stop; the user has to wrap the offending dynamic access in `<Suspense>` before either loop can help.

## verify requires a visible delta (shared)

Each loop captures a baseline screenshot of the shell before applying any change, then re-screenshots after. Report both paths in the final summary so the user can see what changed. The two captures must visibly differ — fallback area shrunk, content promoted to the static surface, target fallback gone or content-shaped. Identical-looking captures mean the refactor didn't land; undo. "Compiles cleanly" is not the bar.

**Hide the dev overlay before each screenshot.** The Next.js dev overlay (`<nextjs-portal>` at the document root) renders instant-nav guidance, build errors, and other dev chrome that pollute the before/after comparison. Hide it, screenshot, restore:

```
agent-browser eval "document.querySelector('nextjs-portal').style.display='none'"
agent-browser screenshot <path>
agent-browser eval "document.querySelector('nextjs-portal').style.display=''"
```

## anti-patterns (shared)

**Don't replace granular Suspense boundaries with a top-level loading skeleton.** A `loading.tsx` for the whole segment, or a root-level `<Suspense fallback={<Skeleton />}>` (or worse, `fallback={null}` that blanks the UI), defeats this skill's optimization — which is to extract real static chrome above each granular boundary and use content-shaped fallbacks per region. A coarse "the page is loading" stand-in bypasses the work entirely.

## gotchas (shared)

- Dev doesn't prefetch the way production does, and routes compile on first hit — so after a navigation or reload, the DOM keeps updating for noticeably longer than the eventual production experience. Wait patiently for the DOM to stabilize before capturing the React tree or taking a screenshot — e.g., poll `document.documentElement.innerHTML.length` until it's unchanged across two consecutive reads. A fixed short delay risks sampling mid-render.
- Don't try to verify nav prefetch by inspecting dev network traffic — dev doesn't fire prefetch requests at all, so the network tab, manual `router.prefetch()` calls, and `<Link prefetch={true}>` will all look broken regardless of whether your code is correct. The cookie-locked SPA-nav recipe in [instant-nav-loop.md](./instant-nav-loop.md) under `verify` is already the canonical recipe for this — it simulates what production would prerender into the prefetched RSC without requiring prefetch to actually fire. Use it; don't invent a network-tab alternative.
- The diagnose pipeline can be flaky — DevTools attachment timing, DOM-settle races, and dev compilation effects can each produce inconsistent captures from one run to the next. When a result feels off (a candidate appears that you don't expect, or one you expect doesn't), re-run the diagnose 2–3 times and cross-check; boundaries that appear consistently are real, one-off appearances are noise.

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

Per-loop primitives in [instant-nav-loop.md](./instant-nav-loop.md).

## teardown (shared)

Delete the cookie by name — overwrite with an expired stamp:

```
agent-browser cookies set next-instant-navigation-testing x \
  --url <origin> --expires 1
```

Never `agent-browser cookies clear` (no args) — wipes auth.

---

Sibling of `next-dev-loop` — initiate that first.
