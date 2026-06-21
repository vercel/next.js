---
name: next-cache-components-adoption
description: >
  Turn on Cache Components in a Next.js app and resolve the blocking routes it
  surfaces. Use when the user wants to enable, adopt, or migrate to Cache
  Components, flip the `cacheComponents` flag, work through a flood of
  blocking-prerender / instant validation errors, run the
  `cache-components-instant-false` codemod, or decide between opting routes out
  with `export const instant = false` and fixing them in place.
---

# Cache Components Adoption

Enable Cache Components on an app and work it to a clean build. This skill sequences the work; it does not teach how to fix individual errors — the dev overlay fix cards, the stack traces, and the `/docs/messages/blocking-prerender-*` pages do that.

## Prerequisite: be on Next.js 16.3 or later

This skill assumes **Next.js 16.3+**. That release is where the pieces it relies on land: top-level `cacheComponents`, `export const instant`, the dev overlay **Insights** tab, the `link-prefetch-partial` Insight, and the `cache-components-instant-false` codemod. On older versions the validation signals the skill walks you through don't exist, so there's little to guide the work.

**Upgrade first if needed.** Check the installed version (`next --version` or `package.json`). If it's below 16.3, upgrade before doing anything else:

- Run `npx @next/codemod@latest upgrade latest` to move to the current release and apply the version-to-version codemods.
- Follow the [version upgrade guides](https://nextjs.org/docs/app/guides/upgrading) for the major(s) you're crossing (e.g. [Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)) — read the guide for the version you're on, don't guess.

Get the app building on 16.3+ first, then come back and adopt Cache Components.

This skill assumes a clean starting point. If the app still uses `experimental.dynamicIO` / `experimental.useCache`, route segment configs (`dynamic`, `revalidate`, `fetchCache`), or `unstable_cache()`, work those out first via the [migration guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components), then come back here.

Adoption has four milestones, in order. Each is shippable on its own; stop after any of them. These are lettered (A–D) on purpose — they are **not** the numbered Steps below. The numbered Steps (1–5) are the procedure; the milestones are the outcomes they produce.

- **A. Green build.** Get `next build` passing with `cacheComponents` on — blanket `instant = false` if needed. This is the baseline; everything builds and behaves as before. (Steps 1–2 below.)
- **B. Remove `instant = false`.** Make routes genuinely prerenderable (Stream / Cache) so the opt-outs come back off, feature by feature. This is where the real adoption work is. (Steps 2–3 below.)
- **C. Make navigations instant.** With the build clean, resolve the instant-navigation validation warnings in the dev overlay's **Insights** tab. They're dev-only (they don't block the build) and look like the blocking-prerender errors you cleared in Step 2 — you fix them the same way. This is the work that actually makes navigations instant. (Step 4 below.)
- **D. Adopt Partial Prefetching.** Turn on `partialPrefetching` and tune `<Link>` so prefetching ships only the static shell by default — the last step to the full Cache Components experience. (Step 5 below.)

For everything that is not a blocking-route error (`dynamic`, `revalidate`, `fetchCache`, `unstable_cache` → `"use cache"`, `revalidateTag` / `updateTag`, `generateStaticParams`, async `cookies()` / `headers()`, route handlers, `generateMetadata`, `runtime`), follow the migration guide:

- <https://nextjs.org/docs/app/guides/migrating-to-cache-components>
- Offline copy, if present: `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`

**Prefer the bundled offline docs over `nextjs.org` for every link in this skill.** Every guide linked below ships at `node_modules/next/dist/docs/<same-path>.md` (drop the `/docs/` prefix and append `.md`). Use the offline copy when present: it's faster, version-matched to the installed Next.js, and immune to URLs that have shifted between drafts and published pages. Fall back to the public URL only if the offline file is missing.

If the offline docs are missing entirely, run `npx @next/codemod@latest agents-md` to write a version-matched docs index into `AGENTS.md` / `CLAUDE.md`, then read from there instead of guessing API shapes.

## Background

`cacheComponents: true` requires every route to be prerenderable. A route that reads request-time data outside `<Suspense>` is "blocking" and **fails the build**. `export const instant = false` marks a route as allowed to block, which clears it in both dev and build; on a layout it covers the whole subtree beneath it. Milestones A and B are about getting these opt-outs in, then back out.

**`instant = false` does not clear sync-IO errors.** Unstable values evaluated at module/render time — `new Date()`, `Date.now()`, `Math.random()`, `crypto.randomUUID()` — still fail the prerender (`blocking-prerender-current-time` / `-random` / `-crypto`) even with the opt-out, because they produce a different result on every render and can't be baked into a static shell. So the blanket codemod gets the build green **only if no shared layout or page calls one of these directly**; if one does, you must fix it regardless of `instant = false`. The fix is `await io()` (from `next/cache`) immediately before the call — it tells Next.js synchronous IO follows, so the value is treated as request-time instead of prerendered. (`await connection()` from `next/server` also works and is what the error's `[dynamic]` fix card suggests; `io()` is the more targeted signal for sync IO.) This most often bites in a shared layout, where one `new Date()` blocks every route under it.

Milestone C is a separate, dev-only surface: instant-navigation validation warnings in the dev overlay's **Insights** tab. They don't block the build. Work them down once the build is clean — see the [instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation).

Milestone D is the final advancement: [Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching). It's a config flag plus `<Link>` tuning, not a build gate. With `cacheComponents` clean, it makes `<Link>` ship only the static [App Shell](/docs/app/glossary#app-shell) by default instead of the full route, which is the biggest payoff of Cache Components. Like milestone C, it surfaces a dev-only Insight (for `<Link prefetch={true}>` pointing at routes that haven't adopted it) rather than failing the build.

## How to surface the errors

**Primary: the dev server.** Visit a route; its blocking errors surface in the dev overlay with full stack traces, fix cards, and a **Copy as prompt** button. Work one route at a time — errors don't all accumulate in one place.

**Alternative: build.** `next build` reports a blocking route too, but the default output stops at the first one, so the dev server above is better for sizing up the work. When you do run a build, the [Building guide](https://nextjs.org/docs/app/guides/building) covers the route-table glyphs and the flags (`--debug-prerender`, `--debug-build-paths`) for scoping.

**Verifying a fix at runtime.** A green build or a cleared overlay isn't proof the route actually behaves — Cache Components is a runtime concern (a static shell with streamed data). The [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) skill is the cleanest way to confirm each change at runtime: it cross-checks `/_next/mcp` against the live browser. It's a **separate companion skill** from the same Next.js skills collection, so install it if your agent doesn't have it:

```bash
npx skills install https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop
```

It has its own hard prerequisites (Turbopack and `agent-browser >= 0.27.0`) and will tell you how to set those up. **If it isn't available**, do the same loop by hand: keep `next dev` running, open the route in a browser, and read errors from the dev overlay (or the browser console) — don't fall back to grepping source or trusting the build alone. Either way, verify after every fix in the steps below, not only at the end.

## Step 1 — Choose a strategy

Ask the user; don't assume. **In a non-interactive run** (no way to prompt), default to **Blanket** for a multi-route app and **Direct** for a single-route or handful-of-routes app, and say so when you start.

- **Blanket** — run the codemod to opt every page and layout out, get a clean build immediately, **merge that**, then remove the opt-outs feature by feature in follow-up PRs. Use for large apps, team repos (a long-lived failing branch blocks others), or when you can't land every route in one PR.
- **Direct** — enable the flag and fix every route in place in one pass. Use for small or solo apps where one PR is realistic.

### Blanket

```bash
npx @next/codemod@latest cache-components-instant-false ./app
```

Inserts `export const instant = false` (with a `// TODO: Cache Components adoption` comment) into every `app/**/{page,layout,default}` file, skipping files that already declare `instant` and Client Components (`"use client"`). Then set `cacheComponents: true`. The TODO comments are the work queue.

If the command exits with `Invalid transform choice`, your installed `@next/codemod` predates 16.3. Until you can upgrade, do the same opt-out by hand: in every `app/**/{page,layout,default}.{js,jsx,ts,tsx}` file that is **not** a Client Component and does **not** already export `instant`, insert this near the top of the file (after any imports):

```ts
// TODO: Cache Components adoption. Remove once this route navigates instantly.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false
```

The codemod opts **every** segment out, not only the root, on purpose. Resolution is top-down, first-explicit-config-wins: the **highest** `instant = false` in a route's tree decides the whole subtree, and deeper ones are never read. If you only opted the root layout out, removing it would re-arm validation for the entire app at once. With an opt-out on every segment, removing one segment's opt-out validates only **that** segment — its descendants keep their own opt-outs and stay green, so the blast radius is one segment at a time.

Because the highest opt-out wins, you remove them **top-down** (root first, then descend). Removing a leaf's opt-out does nothing while an ancestor still holds one.

**Confirm milestone A with a build.** Run `next build` and make sure it completes with no blocking-route errors before you call the green build done. The codemod gets you most of the way, but a shared layout that calls `new Date()` / `Math.random()` directly still fails regardless of the opt-out (see Background), so the build is the proof, not the codemod run. Once it passes, the app runs with `cacheComponents` on and behaves as before. This is a natural stopping point — ask the user whether to open a PR for it before starting milestone B, or keep going. Don't silently roll on.

After running the codemod, **confirm the root layout got an opt-out** (`grep -n "export const instant" app/layout.*`). The root layout is the one segment that must be covered: it renders every route, including framework routes like `/_not-found`, so if it still reads `cookies()` without an opt-out the build fails on `/_not-found` even though no other route changed. If it was missed, add `export const instant = false` to it by hand.

**Never add `instant = false` to a synthetic route** like `/_not-found` — there is no user file for it, and the directive wouldn't apply. When `/_not-found` (or another framework route) blocks, the cause is the **root layout** it renders through; fix the opt-out there.

**Client Components (`"use client"` pages/layouts) get no opt-out** — the codemod skips them, on purpose. `instant` is a Server Component route segment config; exporting it from a client module is a build error (`E1344`). They don't need one anyway: a client page is covered by its nearest server layout's opt-out (resolution walks top-down, and the layout's `instant = false` shadows the whole subtree), and a client page can't read server request data (`cookies()`, `headers()`, `await params`) itself, so it rarely blocks on its own. If a route with a client page still blocks, the cause is server-side data in an ancestor layout — fix the opt-out or the read there, not on the client page.

### Direct

Set `cacheComponents: true` and collect the errors (above). The reported routes are the work queue; there are no opt-outs to remove.

## Step 2 — Remove opt-outs, one group at a time

You're removing opt-outs route by route, but group the work by area — a feature subtree (`app/dashboard/**`), or a top-level app if the repo has several (marketing, app, docs). Finish one group before moving to the next; each is an independent, mergeable change.

Within a group, remove opt-outs **top-down** (layouts before the pages beneath them, starting at the root layout). The highest `instant = false` in a route's tree is the one in effect, so removing a page's opt-out does nothing while an ancestor layout still has one — the ancestor must go first. The root layout is often the hardest (it wraps `<html>` / `<body>` and frequently reads `cookies()`), but it shadows every route including framework routes like `/_not-found`, so it has to be fixed before anything below it can be validated. (Direct path: there are no opt-outs — fix each failing route; if a hand-written opt-out on an ancestor shadows it, remove the ancestor's first.)

For each route in the group:

1. Remove its `instant = false` (blanket) or target the failing route (direct).
2. Reload it in dev (or `next build --debug-build-paths /that/route`). If it's clean, the route was already prerenderable — move on.
3. If it still blocks, read the error in the dev overlay and its stack trace, then apply the fix it points at. Read the full linked page behind the fix card's **Learn more** — not only the **Copy as prompt** snippet — before editing; the card unblocks the build, but the page covers the details that make the route's navigation actually instant (e.g. where to place a `<Suspense>` boundary). Don't improvise. If you're unsure which fix fits — the right call usually depends on what this part of the page is _for_, which the code doesn't capture — ask the user about their goal for it rather than guessing. Frame it as a product/UX question: should this content be there instantly on load, or is it fine for it to stream in a moment later? Should everyone see the same thing (cacheable) or is it per-user / per-request? Tie the technical fix to that answer (cache it, wrap it in `<Suspense>`, or keep it request-time), so they're deciding the experience, not the API.
4. Re-check the route, then move to the next. **If your fix touched shared code** (a layout, or a shared component like a sidebar/breadcrumb), re-check the other routes that render it too — a shared-shell change can fix the route you're on and break a sibling. **If a route is genuinely meant to block** (it's inherently per-request with no useful static shell), or the refactor would be large and the user would rather not take it on now, that's a legitimate outcome — keep `instant = false`, but confirm it with the user first and turn its `// TODO: Cache Components adoption` comment into a reason, e.g. `// instant = false: kept on purpose — fully request-time dashboard` or `// instant = false: deferred, refactor too large for now`. A documented, deliberate Block is fine to leave after the migration; an undocumented leftover opt-out is not.

Keep a todo list of the group's routes and work it to completion; don't truncate. When every route is clean, move to **Step 3** to verify the group and show the results to the user before opening a PR.

## Step 3 — Verify (per group)

This Step verifies milestone B (opt-outs removed) for the group you cleaned in Step 2. It is a checklist, not new adoption work.

- Build: `next build` completes without blocking-route errors.
- The group's routes no longer carry `// TODO: Cache Components adoption` opt-outs (`grep` to confirm). Any `instant = false` left behind must be a **deliberate, documented Block** — its comment rewritten to a reason (per Step 2's last point), not the original `// TODO`. A bare `// TODO` opt-out is unfinished work; a documented one is a decision.
- Drive each route in dev, not only the build — use the **`next-dev-loop`** skill (or the manual dev-overlay loop if it isn't available; see "Verifying a fix at runtime" above). Visit it, wait for streaming to settle, and confirm every `<Suspense>` fallback you added resolves to its real content (not stuck on a skeleton or a blank). A green build with zero opt-outs is not the same as a working route. Query the live DOM if a tool's snapshot looks stale before reporting a route as broken.
- Show the user the rendered result before moving on. For each route you cleaned, surface what it looks like now (a screenshot, or the visible content you observed) and confirm they're happy with it — the build can't tell whether the streamed-in loading state, the fallback, or the final layout matches what they want. Adoption changes the _experience_ (instant shell + streamed data), so the person who owns the product should sign off on each piece, not the agent alone. This is what makes incremental adoption safe to roll forward.

**Expect some routes to still print `ƒ` (Dynamic) in the build's route table — that is success, not a regression.** A route comes out `ƒ` when it does request-time work through the documented escape hatch (e.g. a layout that `await connection()` for `new Date()`); the page is no longer _opted out_, it is genuinely dynamic. Don't rip the escape hatch back out chasing a `◐`.

When the group passes and the user is happy with each route, **stop and ask**: open a PR and move to the next group, or stop here? If you stop here, **milestone B is incomplete** — the rest of the app still carries `instant = false`, and Steps 4–5 only apply to the cleaned group. Don't silently roll on, and don't treat one cleaned group as the whole adoption.

Milestone B is done only when **every** group is clean — every `instant = false` left is a documented, deliberate Block, and no bare `// TODO: Cache Components adoption` opt-outs are left. Grep the whole app to confirm (`grep -rln "TODO: Cache Components adoption" app` should return nothing; any remaining `instant = false` should sit under a reason comment). A single cleaned group is a checkpoint, not the finish line. When the whole app is clean, move on to **Step 4** to make navigations instant.

## Step 4 — Make navigations instant (milestone C)

**Precondition: milestone B is complete across the app.** Before starting this step, confirm no route outside the cleaned group still carries an undocumented opt-out (`grep -rln "TODO: Cache Components adoption" app` should return nothing; documented, deliberate Blocks are fine to leave). If bare opt-outs are left, you're not ready for Step 4 — go back to **Step 2** and finish the other groups first. Making navigations instant on a handful of routes while most of the app is still opted out of validation isn't meaningful adoption. If the user genuinely wants to proceed on the cleaned subset only, say so explicitly and flag that the rest of the app is unmigrated — don't assume they want to skip ahead.

A green build means no route is _opted out_, not that navigations are instant. Next.js surfaces instant-navigation validation warnings: dev-only signals (they don't block the build) that look like the blocking-prerender errors you cleared in Step 2, and you fix them the same way — read the warning and apply the fix it names.

These warnings fire on **navigation**, not on hover or prefetch (dev doesn't prefetch), so drive the app — use the **`next-dev-loop`** skill (or the manual dev-overlay loop) — and navigate into each route to surface them. They appear in the dev overlay's **Insights** tab with fix cards and a **Copy as prompt** button, the same as the blocking-prerender errors in Step 2.

Work them down once the build is clean, group by group like Step 2. See the [instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation) for the per-warning details — and for **locking the result in**: its [e2e-test section](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) covers the `@next/playwright` `instant()` helper, which asserts on the UI that's available immediately on navigation. The `next-dev-loop` check confirms a route is instant _now_; an `instant()` test keeps it that way in CI. Consider adding one per route you make instant.

This is where navigations actually become instant. It's the last required adoption milestone; **Step 5** (Partial Prefetching) and the optimizer skill below are optional polish.

## Step 5 — Adopt Partial Prefetching (optional)

**Precondition: milestones A–C are complete across the app** (build green, no `instant = false` outside deliberate Blocks, navigations instant). If earlier milestones are unfinished, go back rather than adopting Partial Prefetching on a partially-migrated app.

Once the build is clean and navigations are instant, adopt Partial Prefetching for the full Cache Components payoff: `<Link>` prefetches only the static [App Shell](/docs/app/glossary#app-shell) by default instead of the whole route. It's config plus `<Link>` tuning, not a build gate — a separate, mergeable milestone after milestones A–C.

Follow the [Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) guide for the whole flow — the incremental `prefetch = 'partial'` path, the flag-flip, and the "Auditing existing `<Link prefetch={true}>` calls" table that maps each link to its fix. The dev-only `link-prefetch-partial` warning drives it, the same way Step 4's warnings drive that step. As in Step 4, it fires on **navigation** (not hover/prefetch — dev doesn't prefetch), so navigate with **`next-dev-loop`** to surface it. The one piece of sequencing the guide assumes you know: walk the warnings **before** enabling the global `partialPrefetching` flag — flip it first and every route counts as adopted, so the warnings never fire and you lose the signal for which links to audit. Trust the warning text and the guide's audit table for the per-link fix; the segment-config values are simple to misremember.

## Optional: grow static shells

With adoption done, the [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) skill is an optional polish pass: it grows each route's static shell so more of the page prerenders and less streams in. It doesn't gate the build or block navigation — reach for it only when you want to push shells further after the milestones above are complete. Install with:

```bash
npx skills install https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer
```
