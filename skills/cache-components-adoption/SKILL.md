---
name: cache-components-adoption
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
it.

Getting the build green is the adoption goal here. The separate
instant-navigation validation — `experimental.instantInsights.validationLevel`,
default `'warning'` — is dev-only and lower priority: it surfaces routes whose
navigations wouldn't be instant, as warnings in the Insights tab. It does not
block adoption. Leave it at the default and treat it as a follow-up; see the
[instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation)
once the build is green.

## How to surface the errors

**Primary: the dev server.** Most efficient. Visit a route and its blocking
errors print to the **server console** with full stack traces — you don't have
to drive the overlay UI, just read the logs. The same errors appear in the dev
overlay **Insights** tab with Stream / Cache / Block fix cards and a **Copy as
prompt** button if you want them. Errors don't all accumulate in one place, so
work one route at a time rather than trying to collect everything up front.

**Alternative: build.** `next build` fails on blocking routes and lists them,
but it's a slower loop — you rebuild to re-check. Pass `--debug-prerender` for
full stack traces (the default build output is terser), and `--debug-build-paths
/r1 /r2` to rebuild only the routes you're iterating on.

## Step 1 — Choose a strategy

Ask the user; don't assume.

- **Blanket** — run the codemod to opt every page and layout out, get a clean
  build immediately, then remove the opt-outs route by route. Use for large
  apps, team repos (a long-lived failing branch blocks others), or when you
  can't land every route in one PR.
- **Direct** — enable the flag and fix routes in place in one pass. Use for
  small or solo apps where one PR is realistic.

### Blanket

```bash
npx @next/codemod@latest cache-components-instant-false ./app
```

Inserts `export const instant = false` (with a `// TODO: Cache Components
adoption` comment) into every `app/**/{page,layout}` file, skipping files that
already export `instant`. Then set `cacheComponents: true`. The TODO comments
are the work queue.

### Direct

Set `cacheComponents: true` and collect the errors (above). The reported routes
are the work queue; there are no opt-outs to remove.

## Step 2 — Walk routes, layouts before pages

A layout's `instant = false` covers its whole subtree, so removing it re-arms
validation for every descendant at once. Going top-down surfaces those
descendant errors deliberately instead of as a surprise cascade.

For each route in the queue:

1. **Blanket:** remove the route's `instant = false`. **Direct:** target the
   failing route.
2. Reload it in dev (or `next build --debug-build-paths /that/route`). If it's
   clean, the route was already prerenderable — move on.
3. If it still blocks, read the logged error and its stack trace, then apply the
   fix it points at. The dev overlay fix card's **Copy as prompt** and the
   linked `/docs/messages/blocking-prerender-*` page carry the details — don't
   improvise.
4. Re-check the route, then move to the next.

Keep a todo list of the whole queue and work it to completion; don't truncate.

## Step 3 — Verify

- Build: `next build` completes without blocking-route errors.
- Blanket: no `// TODO: Cache Components adoption` opt-outs remain except
  deliberate ones (`grep` to confirm). A route you intend to keep blocking keeps
  its `instant = false`.

Then hand off to **`next-cache-components-optimizer`** to grow each route's
static shell and make navigations feel instant.
