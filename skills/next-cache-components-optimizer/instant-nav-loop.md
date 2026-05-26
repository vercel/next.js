# instant-nav-loop (sub-reference of next-cache-components-optimizer)

In-app navigation optimization: when the user clicks a link from A to B, show B's static layout immediately — chrome, structure, content-shaped fallbacks — instead of holding A's UI until B's data resolves.

Strictly smaller than page-render — only segments newly mounted on B's path need a shell. The LCA layout stays mounted with its already-resolved data, so even a dynamic-root app can have instant in-app nav.

The hard part is **identifying real blockers**. After `pushstate`, capture B's suspended boundaries with `agent-browser react suspense --only-dynamic --json`. Each boundary carries `suspended_by[].name` — `usePathname` / `useSearchParams` / `useRouter` (client-hook), `cookies` / `headers` / `connection` (request-api), names containing `fetch` or `cache` (server-fetch / cache), etc.

**Client-hook blockers don't block instant nav.** They suspend only during SSR prerender; on a client nav (`pushstate`) they resolve instantly from the router store. Diagnose drops them as candidates (see step 4 for the operational set), so the loop doesn't recommend SSR-only refactors that have no effect on click-to-paint.

When the user navigates from A to B, the layouts they share stay mounted; only the segments past the point where the two routes diverge actually load. So B's suspended-boundary capture is naturally focused on the new work — you don't have to filter out the shared parts. With multiple real candidates, fix the one highest in the new-segments tree (closest to where A's and B's paths diverge) first.

Complementary to Next.js's Instant Insights, which checks Suspense _existence_ (structural). This loop checks fallback _quality_ (visual) — closing the `<Suspense fallback={null}>` loophole.

## preflight (in addition to shared)

The starting page is **A** — the route the user is navigating _from_. The shared preflight has already anchored A (the user is on it, logged in, with state set up). Now anchor B:

1. Ask the user to perform the navigation to B in the headed browser — click the link, button, or whatever leads there. Read `agent-browser get url` to confirm B's URL.
2. `agent-browser pushstate <A>` to return the browser to A. The diagnose loop starts from A.

Set the instant cookie (per shared `instant cookie` section) any time after the browser is on A but before calling `pushstate`. There's no race — the cookie only needs to be present at the moment of navigation. The cookie doesn't block the navigation; it gates the framework's dynamic-data writes, so B's React tree mounts normally but its dynamic Suspense boundaries stay in fallback until the cookie is cleared. (Setting the cookie before a direct load of A or B would freeze that page at its static shell — that's why we wait until the user is on A first.)

## loop

### diagnose

1. **Set the instant cookie and navigate via `pushstate <B>`.** Wait for the DOM to settle. B's tree is now mounted; its dynamic boundaries stay in fallback while the cookie holds.

2. **Check B for the no-shell bailout** per SKILL.md.

3. **Capture B's suspended set.** `agent-browser react suspense --only-dynamic --json` → boundaries with `suspended_by[]`.

4. **Filter to real nav candidates.** Drop boundaries whose `suspended_by` entries are **all** client-hook names (`usePathname`, `useSearchParams`, `useRouter`, `useSelectedLayoutSegment(s)`, `useParams`) — SSR-only, won't help nav. Keep boundaries with at least one request-api, server-fetch, or cache blocker.

5. **Gauge the gap.**
   - No candidates → ask the user if the nav still feels slow. No → stop and offer to audit other A → B pairs. Yes → step 8 (unwrapped async).
   - Candidates present → screenshot the locked B state (hide `nextjs-portal` per the shared rule), check rendered area. All sub-viewport → already in good shape; stop.

6. **Resolve sources** for each remaining candidate via `POST /__nextjs_original-stack-frames` on `suspended_by[].owner_stack` (or `jsx_source` if the stack is empty).

7. **Pick the highest candidate.** With multiple candidates, fix the one highest in B's new-segments tree — closest to where A's and B's paths diverge. If that candidate wraps the others, recurse: read inside the wrapper to find the I/O that's actually blocking.

8. **Fallback: unwrapped async.** Reached from step 5 when there are no `react suspense` candidates but the nav still feels slow. The blocker has no `<Suspense>` so it doesn't appear in the capture. Direct-load B (full page navigation, not pushstate; cookie still set); `mcp get_logs` surfaces a `blocking-route` 500 naming the unwrapped I/O. Filter to sources past the point where A's and B's paths diverge; bailouts in shared layouts above are PPR concerns, not nav.

### decide / apply

Apply the shared lever rules from SKILL.md; push-down recipes work at layouts too.

**Nav-only third lever: private cache + runtime prefetch.** For I/O that reads `cookies()` / `headers()` / `searchParams`, shared `'use cache'` won't help — those reads bail to dynamic. Use `'use cache: private'` + `cacheLife({ stale: N })` on the I/O function, plus `unstable_prefetch = 'force-runtime'` as a route segment config (page or layout export) on the segment that owns the private content. When a `<Link>` becomes visible, the framework prefetches that segment's private-cached content with the user's session; the click commits with cookie-derived data already in place.

The `unstable_prefetch` flag applies to the segment plus every descendant — put it on the most ancestral segment with runtime-cacheable content (layout-level covers all child pages; page-level covers only that page). Server Component only (not allowed with `"use client"`); requires `cacheComponents: true`. Valid values: `'auto'` (default) / `'force-disabled'` / `'force-static'` / `'force-runtime'`. It doesn't make any segment cacheable on its own (each still needs `'use cache: private'`), doesn't help cold loads (no `<Link>` to prefetch from), and doesn't override `await connection()`.

### verify

**Cookie-locked SPA-nav screenshot** is the canonical visible delta — what production would have prefetched. Recipe (run once before applying, once after):

1. Be on A. Set the instant cookie.
2. `agent-browser pushstate <B>` — a real client navigation.
3. Wait for the DOM to settle. With the cookie set, the framework gates dynamic-data writes (see preflight), so the captured state is the static shell + Suspense fallbacks.
4. Hide `nextjs-portal`, screenshot, restore (per the shared rule).

Compare the two screenshots per the shared visible-delta rule. The after-shot must visibly differ — more static content promoted, content-shaped fallbacks, or (for the private + runtime-prefetch lever) cookie-derived data resolved.

Also:

1. **Re-run the diagnose capture.** Repeat steps 1–4 on the new code. The target candidate should be absent from B's suspended set (the blocker is gone), or its fallback should now be content-shaped.
2. Re-check B for the no-shell bailout.

## reference (loop-specific)

```
agent-browser pushstate <url>            client-side navigation (no
                                         HTTP request, no full reload)

'use cache: private'                     per-session cache; cookies /
                                         headers / searchParams reads ok

unstable_prefetch = 'force-runtime'      route-level: framework actively
                                         prefetches private-cached
                                         content when <Link> is visible

unstable_instant = false                 layout-level opt-out; escape
                                         hatch, anti-pattern
```
