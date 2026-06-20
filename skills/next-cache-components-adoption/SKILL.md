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

Enable Cache Components on an app and work it to a clean build. This skill
sequences the work; it does not teach how to fix individual errors — the dev
overlay fix cards, the stack traces, and the `/docs/messages/blocking-prerender-*`
pages do that.

## Prerequisite: be on Next.js 16.3 or later

This skill assumes **Next.js 16.3+**. That release is where the pieces it relies
on land: top-level `cacheComponents`, `export const instant`, the dev overlay
**Insights** tab, the `link-prefetch-partial` Insight, and the
`cache-components-instant-false` codemod. On older versions the validation
signals the skill walks you through don't exist, so there's little to guide the
work.

**Upgrade first if needed.** Check the installed version (`next --version` or
`package.json`). If it's below 16.3, upgrade before doing anything else:

- Run `npx @next/codemod@canary upgrade latest` to move to the current release
  and apply the version-to-version codemods.
- Follow the [version upgrade guides](https://nextjs.org/docs/app/guides/upgrading)
  for the major(s) you're crossing (e.g.
  [Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)) — read
  the guide for the version you're on, don't guess.

Get the app building on 16.3+ first, then come back and adopt Cache Components.

Adoption has four goals, in order. Each is shippable on its own; stop after any
of them.

1. **Green build.** Get `next build` passing with `cacheComponents` on —
   blanket `instant = false` if needed. This is the baseline; everything builds
   and behaves as before.
2. **Remove `instant = false`.** Make routes genuinely prerenderable (Stream /
   Cache) so the opt-outs come back off, feature by feature. This is where the
   real adoption work is.
3. **Address dev-only insights.** With the build clean, resolve the
   instant-navigation validation warnings (dev-only, lower priority) to make
   navigations actually instant.
4. **Adopt Partial Prefetching.** Turn on `partialPrefetching` and tune
   `<Link>` so prefetching ships only the static shell by default — the last
   step to the full Cache Components experience.

For everything that is not a blocking-route error (`dynamic`, `revalidate`,
`fetchCache`, `unstable_cache` → `"use cache"`, `revalidateTag` / `updateTag`,
`generateStaticParams`, async `cookies()` / `headers()`, route handlers,
`generateMetadata`, `runtime`), follow the migration guide:

- <https://nextjs.org/docs/app/guides/migrating-to-cache-components>
- Offline copy, if present: `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`

If the offline docs are missing, run `npx @next/codemod@latest agents-md` to
write a version-matched docs index into `AGENTS.md` / `CLAUDE.md`, then read from
there instead of guessing API shapes.

## Background

`cacheComponents: true` requires every route to be prerenderable. A route that
reads request-time data outside `<Suspense>` is "blocking" and **fails the
build**. `export const instant = false` marks a route as allowed to block, which
clears it in both dev and build; on a layout it covers the whole subtree beneath
it. Goals 1 and 2 are about getting these opt-outs in, then back out.

**`instant = false` does not clear sync-IO errors.** Unstable values evaluated
at module/render time — `new Date()`, `Date.now()`, `Math.random()`,
`crypto.randomUUID()` — still fail the prerender (`blocking-prerender-current-time`
/ `-random` / `-crypto`) even with the opt-out, because they produce a different
result on every render and can't be baked into a static shell. So the blanket
codemod gets the build green **only if no shared layout or page calls one of
these directly**; if one does, you must fix it regardless of `instant = false`.
The fix is `await io()` (from `next/cache`) immediately before the call — it
tells Next.js synchronous IO follows, so the value is treated as request-time
instead of prerendered. (`await connection()` from `next/server` also works and
is what the error's `[dynamic]` fix card suggests; `io()` is the more targeted
signal for sync IO.) This most often bites in a shared layout, where one
`new Date()` blocks every route under it.

Goal 3 is a separate, dev-only surface: instant-navigation validation warnings
in the Insights tab. They don't block the build. Work them down once the build
is clean — see the
[instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation).

Goal 4 is the final advancement: [Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching).
It's a config flag plus `<Link>` tuning, not a build gate. With `cacheComponents`
clean, it makes `<Link>` ship only the static [App Shell](/docs/app/glossary#app-shell)
by default instead of the full route, which is the biggest payoff of Cache
Components. Like goal 3, it surfaces a dev-only Insight (for `<Link prefetch={true}>`
pointing at routes that haven't adopted it) rather than failing the build.

## How to surface the errors

**Primary: the dev server.** Visit a route; its blocking errors surface in the
dev overlay with full stack traces, fix cards, and a **Copy as prompt** button.
Work one route at a time — errors don't all accumulate in one place.

**Alternative: build.** `next build` reports a blocking route too, but it stops
at the **first** one it hits and exits, so it's a poor way to size up the work
(you fix one, rebuild, hit the next). The dev server above is better for
scoping. Pass `--debug-prerender` for full stack traces (the default build
output is terser), and `--debug-build-paths /r1 /r2` to rebuild only the routes
you're iterating on.

## Step 1 — Choose a strategy

Ask the user; don't assume.

- **Blanket** — run the codemod to opt every page and layout out, get a clean
  build immediately, **merge that**, then remove the opt-outs feature by feature
  in follow-up PRs. Use for large apps, team repos (a long-lived failing branch
  blocks others), or when you can't land every route in one PR.
- **Direct** — enable the flag and fix every route in place in one pass. Use for
  small or solo apps where one PR is realistic.

### Blanket

```bash
npx @next/codemod@latest cache-components-instant-false ./app
```

> The `cache-components-instant-false` transform ships in a recent `@next/codemod`. If `@latest` reports `Invalid transform choice`, your installed version predates it — use `@canary`, or apply the opt-out by hand (add `export const instant = false` to each `app/**/{page,layout}` file that doesn't already export `instant`).

Inserts `export const instant = false` (with a `// TODO: Cache Components
adoption` comment) into every `app/**/{page,layout}` file, skipping files that
already declare `instant`. Then set `cacheComponents: true`. The TODO comments
are the work queue.

The codemod opts **every** segment out, not only the root, on purpose.
Resolution is top-down, first-explicit-config-wins: the **highest** `instant =
false` in a route's tree decides the whole subtree, and deeper ones are never
read. If you only opted the root layout out, removing it would re-arm validation
for the entire app at once. With an opt-out on every segment, removing one
segment's opt-out validates only **that** segment — its descendants keep their
own opt-outs and stay green, so the blast radius is one segment at a time.

Because the highest opt-out wins, you remove them **top-down** (root first, then
descend). Removing a leaf's opt-out does nothing while an ancestor still holds
one.

Once the build is green, the app runs with `cacheComponents` on and behaves as
before. This is a natural stopping point — ask the user whether to open a PR for
it before starting goal 2, or keep going. Don't silently roll on.

After running the codemod, **confirm the root layout got an opt-out** (`grep -n
"export const instant" app/layout.*`). The root layout is the one segment that
must be covered: it renders every route, including framework routes like
`/_not-found`, so if it still reads `cookies()` without an opt-out the build
fails on `/_not-found` even though no other route changed. If it was missed, add
`export const instant = false` to it by hand.

**Never add `instant = false` to a synthetic route** like `/_not-found` — there
is no user file for it, and the directive wouldn't apply. When `/_not-found` (or
another framework route) blocks, the cause is the **root layout** it renders
through; fix the opt-out there.

**Client Components (`"use client"` pages/layouts) get no opt-out** — the codemod
skips them, on purpose. `instant` is a Server Component route segment config;
exporting it from a client module is a build error (`E1344`). They don't need
one anyway: a client page is covered by its nearest server layout's opt-out
(resolution walks top-down, and the layout's `instant = false` shadows the whole
subtree), and a client page can't read server request data (`cookies()`,
`headers()`, `await params`) itself, so it rarely blocks on its own. If a route
with a client page still blocks, the cause is server-side data in an ancestor
layout — fix the opt-out or the read there, not on the client page.

### Direct

Set `cacheComponents: true` and collect the errors (above). The reported routes
are the work queue; there are no opt-outs to remove.

## Step 2 — Remove opt-outs, one group at a time

You're removing opt-outs route by route, but group the work by area — a feature
subtree (`app/dashboard/**`), or a top-level app if the repo has several
(marketing, app, docs). Finish one group before moving to the next; each is an
independent, mergeable change.

Within a group, remove opt-outs **top-down** (layouts before the pages beneath
them, starting at the root layout). The highest `instant = false` in a route's
tree is the one in effect, so removing a page's opt-out does nothing while an
ancestor layout still has one — the ancestor must go first. The root layout is
often the hardest (it wraps `<html>` / `<body>` and frequently reads `cookies()`),
but it shadows every route including framework routes like `/_not-found`, so it
has to be fixed before anything below it can be validated. (Direct path: there
are no opt-outs — fix each failing route; if a hand-written opt-out on an
ancestor shadows it, remove the ancestor's first.)

For each route in the group:

1. Remove its `instant = false` (blanket) or target the failing route (direct).
2. Reload it in dev (or `next build --debug-build-paths /that/route`). If it's
   clean, the route was already prerenderable — move on.
3. If it still blocks, read the error in the dev overlay and its stack trace,
   then apply the fix it points at. The fix card's **Copy as prompt** and the
   linked `/docs/messages/blocking-prerender-*` page carry the details — don't
   improvise.
4. Re-check the route, then move to the next.

Keep a todo list of the group's routes and work it to completion; don't
truncate. When the group is done, **stop and ask the user**: open a PR and move
to the next group, or stop here? Don't silently roll on.

## Step 3 — Verify (per group)

- Build: `next build` completes without blocking-route errors.
- The group's routes no longer carry `// TODO: Cache Components adoption`
  opt-outs, except deliberate Blocks (`grep` to confirm). A route you intend to
  keep blocking keeps its `instant = false`.

Then hand off to **`next-cache-components-optimizer`** to grow each route's
static shell and make navigations feel instant.

## Step 4 — Adopt Partial Prefetching (final advancement)

Once the build is clean and routes are instant, adopt Partial Prefetching for
the full Cache Components payoff: `<Link>` prefetches only the static
[App Shell](/docs/app/glossary#app-shell) by default, instead of the whole route.
This is config plus `<Link>` tuning, not a build gate — do it as a separate,
mergeable milestone after goals 1–3.

The dev-only `link-prefetch-partial` Insight drives this. It fires for a
`<Link prefetch={true}>` pointing at a route that has **not** adopted Partial
Prefetching (so the link falls back to a legacy full prefetch). Let the Insights
guide the work — don't blanket-enable the global flag first, or every route
counts as adopted, the Insights never fire, and you lose the signal for which
links to audit.

1. **Walk the Insights, like goal 3.** Visit routes in dev; each
   `<Link prefetch={true}>` to an unadopted route surfaces a
   `link-prefetch-partial` Insight with three fix cards. Read each card's
   **Copy as prompt** and apply the one that fits — don't improvise:
   - **Upgrade** — opt the destination route into Partial Prefetching with
     `export const prefetch = 'partial'`. Use when the route should ship its
     shell ahead of the click.
   - **Disable** — drop the `prefetch={true}` prop. Use for fully static
     destinations, where the default `<Link>` already loads the page.
   - **Ignore** — `export const instant = false` to silence it.

   The [`instant-link-prefetch-partial`](/docs/messages/instant-link-prefetch-partial)
   page and the [Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching)
   guide (see its "Auditing existing calls" table) carry the per-case details,
   including when to keep `prefetch={true}` and add `prefetch = 'allow-runtime'`
   for routes that read request data.

2. **Flip the global flag last.** Once the `link-prefetch-partial` Insights are
   cleared (except deliberate ignores), enable the config and remove the
   now-redundant per-route `prefetch = 'partial'` exports:

   ```ts
   const nextConfig = {
     cacheComponents: true,
     partialPrefetching: true,
   }
   ```

See the [Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching)
guide for the full adoption path and `<Link>` defaults.
