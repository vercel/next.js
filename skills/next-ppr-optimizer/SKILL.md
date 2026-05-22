---
name: next-ppr-optimizer
description: >
  Optimize the static shell of a `cacheComponents` page. Use this
  skill when a Next.js page feels slow on first paint and you want
  to maximize what's prerendered before any dynamic data streams in.
---

# next-ppr-optimizer

The agentic optimization loop for PPR: diagnose the shell, pick
the highest-ROI refactor, apply it, confirm the shell actually
grew.

Two refactor levers:

- **Push down** — extract an I/O into a child wrapped in Suspense,
  so the parent stays static. Mechanical; see `decide` for the
  autonomy threshold.
- **Cache** — wrap the I/O in `'use cache'` and pick a `cacheLife`
  profile. Freshness is a domain judgment — never invent a profile;
  always ask the user with the named presets.

The hard part is **prioritization**: rank candidates by the
visible pixel area they cover. Largest gap first.

## requires

- `next-dev-loop` already initiated for this session.
- `cacheComponents: true` in `next.config.ts`. Without it there's
  no static shell to optimize — refuse.

## preflight

1. Confirm `cacheComponents: true` in `next.config.ts`. The
   user-driven browser session from `next-dev-loop`'s preflight
   must already be open at the target URL.
2. On that open session, set the `next-instant-navigation-testing`
   cookie via `agent-browser cookies set` — pass name and value as
   separate positional args, not as a `name=value` blob. Value
   format `[0,"p<random>"]`, scoped to the dev server hostname.
   Reload.
   While the cookie is held, dynamic streaming pauses and what's
   visible equals the static shell + Suspense fallbacks.

## loop

### diagnose

1. **Sanity-check the view.** Confirm the visible content is the
   shell, not the dev error overlay (which can paint a sparse
   viewport that mimics a partially-suspended shell). Any of these
   signals means it's a no-shell state — surface the bailout from
   `mcp get_logs` (look for `NEXT_STATIC_GEN_BAILOUT` /
   _blocking-route_) and stop:
   - `mcp get_page_metadata` returns `segments: []` or
     `routerType: "pages"` on what should be an app route.
   - The page request returns HTTP 500.
   - The suspense tree reports zero boundaries on a page that
     visibly rendered something.

2. **List candidates.** `agent-browser react suspense` lists every
   Suspense boundary on the current page and points at the JSX
   site. The source paths are compiled chunks; resolve them to
   user source via `POST /__nextjs_original-stack-frames` (the
   endpoint the dev error overlay uses). That returns user file +
   line + column for each boundary, including ones declared in
   layouts and in imported component files. Blocker classification
   is a soft hint only — plain `fetch()` often classifies as
   `unknown` — so rely on the resolved JSX site and the source you
   read, not on the classification.

3. **Rank by rendered area.** Take both renders: shell-only
   (instant cookie set) and full (instant cookie removed by name
   — see teardown). For each candidate, use the larger of its
   fallback rect (shell-only) and rendered subtree rect (full)
   as the per-candidate ROI. Sort descending. The fallback rect
   alone misleads when developers used an undersized spinner.

4. **If one boundary dominates, re-diagnose deeper.** When a
   candidate's rect covers roughly the entire viewport AND it's
   the only dynamic boundary, push-down is not the move — that
   wrapper _is_ the shell. Resolve the boundary's JSX site, read
   the source it wraps, recurse into the wrapped component, and
   enumerate each `await` and each async child. _Those_ are the
   real candidates; loop back to step 3 with them.

### decide

For each candidate, pick a lever.

- **Push down** when the I/O sits inside a component that also
  contains static content (heading, layout frame, image
  scaffolding) — the static siblings can rise into the shell.
  Apply autonomously when trivial; otherwise propose the diff.
- **Cache** when the I/O has no extractable static structure
  around it, or when caching is genuinely the right answer.
  Ask the user for a freshness budget, map their answer to a
  named `cacheLife` profile (`seconds`, `minutes`, `hours`,
  `days`, `weeks`, `max`, or `default`). Never invent.

### apply

Trivial push-down: extract the awaited call into an `async` child;
replace the parent with a sync function rendering the static
shell plus `<Suspense fallback={…}>` around the new child; pass
the values the child needs as props.

Cache: insert `'use cache'` at the top of the function body, then
`cacheLife('<profile>')` from the agreed preset.

### verify

Re-take the shell-only render. The targeted candidate's gap
should be strictly smaller, or gone (content promoted to shell).
If neither, undo — a refactor that compiles but doesn't grow the
shell is still a regression. Then re-run the diagnose-step-1
check — a botched extract can introduce a no-shell state where
there wasn't one before.

## gotchas

- `cacheLife` presets live in
  `packages/next/src/server/config-shared.ts` — the source of
  truth if the user asks what each preset means.
- Turbopack sometimes caches a stale compile error after the
  underlying issue is fixed; touch the offending file to force
  recompile if the dev server reports an error you've already
  resolved.

## reference

```
next-instant-navigation-testing       cookie freezes streaming; what's
                                      visible = static shell + fallbacks

POST /__nextjs_original-stack-frames  compiled chunk URL + line/col
                                      → user file + line/col

cacheLife('<profile>')                default | seconds | minutes | hours
                                      | days | weeks | max
```

## teardown

Remove the `next-instant-navigation-testing` cookie by name. Do
not use `agent-browser cookies clear` (no args) — that wipes the
user's auth and any other session state.

---

Sibling of `next-dev-loop` — initiate that first. Pick the loop
that matches the work: `next-dev-loop` for general edit/verify,
`next-ppr-optimizer` for shell-area optimization.
