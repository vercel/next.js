# Diagnostic Loop

Use this when Instant work drifts, a shell is blank, the wrong boundary appears, or diagnostics feel noisy.

## Source Priority

1. Next route-specific diagnostics from the dev overlay's **Instant Navigation** panel (the dedicated surface for blocking-route output and the re-arm flow), framework diagnostics, or dev stdout.
2. Browser page errors and console errors captured before navigation.
3. Captured shell DOM from `instant(page, ...)`.
4. Screenshots and visual judgment (last).

Screenshots show what happened; diagnostics show why.

## Known Diagnostic Signatures

The string signatures Next emits for Instant-related issues as of 16.3, in priority order. Use these as `grep` patterns against dev stdout or saved log files. The list is not exhaustive; read surrounding context when the first match is ambiguous.

| Pattern                                                                                                                          | What it signals                                                                                                                     | Where to act                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `blocking-route`                                                                                                                 | The route can't be prerendered as an instant shell. Usually paired with one of the more specific signatures below.                  | Diagnose Slow Navigations step 4 in SKILL.md                                                                                          |
| `encountered uncached data`                                                                                                      | Specific cause behind most `blocking-route` reports: a `fetch`/`connection()` ran outside a Suspense boundary owned by its segment. | "Uncached fetch" row in the Boundary Decision Table                                                                                   |
| `NEXT_STATIC_GEN_BAILOUT` or `throwIfDisallowedDynamic`                                                                          | Dynamic generation was forced (cookies/headers/params in an unexpected place).                                                      | `cookies()`/`headers()` row in the Boundary Decision Table                                                                            |
| `INSTANT_VALIDATION_ERROR`                                                                                                       | Hard-error variant of validation (fires only when `validationLevel` is `experimental-error*`).                                      | Same as `blocking-route`                                                                                                              |
| `Could not validate \`unstable_instant\` because (an error prevented \| the target segment was prevented \| a Client Component)` | The validator couldn't run; fix the underlying render error first.                                                                  | "If Next reports that validation could not complete because rendering failed, fix the render error first" in Diagnostic Reading Rules |
| `\`cookies()\` was called outside a request scope`/`\`headers()\` was called outside a request scope`                            | Request API called from `after()`, a non-request code path, or a cached function.                                                   | "Do not call `headers()` inside `after()`" rule in SKILL.md                                                                           |
| `Expected workStore to be initialized`                                                                                           | Same root cause as request-scope: request API called outside the request.                                                           | Same as above                                                                                                                         |
| `Attempted import error` / `export X was not found` / `is not exported`                                                          | Stale module graph, not actually Instant. Surfaces because validation runs during render.                                           | Restart dev once, fix the export                                                                                                      |
| `server Suspense fallback` / `server shell` near a `use client` reference                                                        | A server Suspense fallback imports through a client boundary; render-recursion risk.                                                | "Render recursion or stack overflow" row in the Boundary Decision Table                                                               |
| `Maximum call stack size exceeded` / `RangeError` during capture                                                                 | Usually the same client-boundary-in-fallback problem.                                                                               | Same as above                                                                                                                         |
| `t('key')(...) is not a function` / `missing translation key`                                                                    | Locale provider misconfigured; not actually Instant.                                                                                | "Function-valued translation crash" row in the Boundary Decision Table                                                                |
| `x-middleware-rewrite` / `x-nextjs-rewritten-path` headers                                                                       | Owner identification: visible URL renders through a different internal route.                                                       | Ownership Checks                                                                                                                      |
| `x-nextjs-postponed` header                                                                                                      | PPR streaming marker; useful for confirming PPR is active on a route.                                                               | (anchor only)                                                                                                                         |
| `Route "/..."` prefix in diagnostics                                                                                             | Route filter; useful for narrowing multi-route logs.                                                                                | (anchor only)                                                                                                                         |
| Stack frame matching `at (cookies\|headers\|generateStaticParams\|rootParams\|Providers\|Layout\|Page)`                          | First actionable stack frame; act on this frame before chasing downstream noise.                                                    | "Read the first route-specific stack frame before editing" rule                                                                       |

One-liner for the common triage case: `grep -aE "blocking-route|uncached data|NEXT_STATIC_GEN_BAILOUT|outside a request scope|workStore" path/to/dev.log`.

## Debug Ladder

When something fails, investigate in order:

1. **Prove the route works outside `instant(...)` in its normal loaded state.** Auth, env, provider, module resolution, and unrelated render errors make Instant evidence inconclusive.
2. **Read the first route-specific Next diagnostic.** Dev stdout often has more precise blocking-route output than the browser overlay. For large logs, grep for the patterns in "Known Diagnostic Signatures" above.
3. **Prove route ownership.** Compare visible URL to middleware/rewrites/parallel slots. Confirm the owner is statically generated for the current variant tuple.
4. **Move exactly one boundary.** Move the runtime read, provider, or Suspense boundary named by the diagnostic. Avoid broad visual cleanup until owner and blocker are understood.
5. **Restart dev only when stale.** Delete `.next` only with stale-dev-server evidence: contradictory diagnostics, removed code still executing, or Turbopack cache restore failures. Do not delete reflexively.

### Classify before patching source

When a Playwright failure could be a test-side bug, the test-side trap list in `playwright-verification.md` is the first place to look.

## Current-Blocker Format

Keep a short note while iterating; rewrite after each run. If the diagnostic changes, drop the old theory.

```text
Route:
Mode: initial load | client nav
Variant tuple:
HTTP status for loaded route:
Internal owner:
Captured boundary:
First Next diagnostic:
Stable UI contract:
Shell level (0-4):
Current blocker:
Next patch:
```

## Minimum Viable Shell Ladder

Separate making the shell valid from making it polished. Do not tune card rows, spacing, or screenshots until the lower levels hold.

```text
Level 0: captured shell is not blank and does not crash.
Level 1: persistent shared layout is correct for the route state.
Level 2: route title and primary frame match the loaded UI.
Level 3: first content region has route-owned local placeholders.
Level 4: captured-shell layout dimensions match the loaded UI within tight tolerances.
```

## Diagnostic Reading Rules

- Prove the route works in its normal loaded state outside Instant capture before treating Instant failures as Instant evidence.
- Read the first route-specific stack frame before editing. The actionable frame is usually the first component that reads `cookies()`, `headers()`, `params`, `searchParams`, `useSearchParams()`, an uncached fetch, or a request promise.
- If Next reports that validation could not complete because rendering failed, fix the render error first.
- If dev stdout collapses the only useful stack to `at ignore-listed frames`, restart dev once with `__NEXT_SHOW_IGNORE_LISTED=true` and rerun the same probe.
- Keep the full dev stdout for that rerun and re-read the tail after exit. Stack-overflow formatting can emit a generic React/Next stack first and an app-owned code frame after flush.
- If dev logs are quiet but the shell is wrong, inspect `loading.tsx/jsx` on the route path. A segment loading boundary can catch the suspension and hide the more actionable diagnostic.
- If `instant(...)` returns 200 but the captured shell body is empty, compare the rewritten internal owner against each dynamic segment's `generateStaticParams()` before editing UI. A non-generated dynamic param produces an empty captured shell.
- If the browser overlay reports an error that source search and typecheck do not back up, restart dev once before editing again. After route-file experiments, parallel-route changes, `generateStaticParams()` edits, or import-graph changes, try a fresh `.next` rerun before treating the next Instant result as source truth.
- If a missing-data route throws `notFound()` but stays on the loading shell, inspect whether PPR/parallel-route streaming already served the page as a 200 shell. Returning a route-owned not-found component directly from the missing-data branch can be the right product fix; document the HTTP semantics tradeoff.

## Build And Prerender Triage

Use production-like build output as a separate signal from dev Instant tests.

- Build can surface routes the focused suite never touched; a green focused test does not mean shared layout/provider work is build-safe.
- Run build with the app's supported Node version; an unsupported local Node turns actionable errors into ignore-listed exceptions.
- After the focused Instant test passes, run a local production-like build before waiting on a Vercel deployment. Use Vercel logs for confirmation or platform-only failures.
- When build reports `blocking-route`, classify the route first: product shell, standalone utility, auth handoff, admin/debug, redirect-only, or data page.
- If build reveals one blocker per run, keep a blocker manifest (route, owner, failure class, next fix) so progress survives each rerun.
- Filter noisy build logs. Warnings about unrelated services, duplicate native libraries, or background streaming errors should be recorded separately from the first route-specific blocker.
- If build fails in translation code, verify the locale provider, server locale, and missing-key fallback shape before treating it as an Instant blocker.

## Ownership Checks

- Compare visible URL with middleware, proxy, rewrites, route groups, and parallel slots. A public URL may render through a hidden internal route tree.
- Prove the captured owner with a stable route marker or captured shell DOM evidence before refactoring UI.
- For shell generation that depends on root variant identity, use the named getters from `next/root-params` (one per generated root param). Treat `props.params` reads in root or shared layouts as suspect until the focused Instant probe proves they do not trigger `NEXT_STATIC_GEN_BAILOUT`.
- If a parent root/layout fallback captures before the target route, fix the parent boundary first. Do not tune child skeletons and call the work done.

## Shell Capture Checks

Before refactoring UI for a blank or wrong shell:

- **Prove ownership first.** A visible URL may rewrite through a different internal owner. Add a route-owned marker (`data-instant-boundary="..."`) or inspect the captured shell DOM to identify the captured boundary.
- **Static owner = route file plus the right `generateStaticParams()`.** For every dynamic segment on the owner path, check the rewrite value against `generateStaticParams()`. A non-generated dynamic param produces an empty captured shell with no obvious page marker.
- **A parent layout's `generateStaticParams()` does not cover a new generated page owner.** If a page owns a hidden static segment, export the concrete static params on that page too.
- **`generateStaticParams()` is a static shell-ownership claim, not a route-table detail.** If the layout exports static params but providers or slots above the inert boundary still start request-backed work, the route is not actually static.
- **Audit sibling parallel slots.** A content page fallback does not protect `@header`, `@sidebar`, or other slots from their own `params`, `searchParams`, `headers()`, or `cookies()` reads.

## Boundary Decision Table

Use the first blocker to choose the smallest useful move:

| Blocker                                                                                   | Prefer                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookies()`, `headers()`, session, user, flags                                            | Keep shared frame above Suspense; move stateful region below; or use a pending provider that exposes shape without resolved facts                                                                                                                                                                                                                                                                                                                                               |
| `params` / root params in shared layout or sibling parallel slot                          | Use named getters from `next/root-params`; read only params the layout owns; audit sibling `@header`/`@sidebar` slots                                                                                                                                                                                                                                                                                                                                                           |
| Per-request identity (scope, tenant, team) drifting across navigations                    | Include the identity in cache keys, request de-dupe keys, and SWR keys; do not rely only on request headers                                                                                                                                                                                                                                                                                                                                                                     |
| Localized shell text                                                                      | Treat locale as part of the route/variant tuple, or suspend the localized region; default locale only in inert fallback                                                                                                                                                                                                                                                                                                                                                         |
| `useSearchParams()`, router/query-state hooks                                             | Wrap the client control in Suspense with an inert box-model fallback                                                                                                                                                                                                                                                                                                                                                                                                            |
| Uncached fetch or async data section                                                      | Keep the section frame visible; suspend only the data row/list/cards                                                                                                                                                                                                                                                                                                                                                                                                            |
| Optional lower-page data throws                                                           | Isolate with a local degraded frame or route error boundary; do not let a catalog query block the primary shell                                                                                                                                                                                                                                                                                                                                                                 |
| Function-valued translation crash (`t('key')(...)` is not a function)                     | Verify locale provider and missing-key fallback shape before treating as an Instant blocker                                                                                                                                                                                                                                                                                                                                                                                     |
| Render recursion or stack overflow during capture                                         | Check whether a server Suspense fallback imports through a `"use client"` module; split inert fallback UI into a server-safe module                                                                                                                                                                                                                                                                                                                                             |
| Strict Playwright failure with two matching visible-shell locators                        | Inspect trace snapshot for hidden streaming DOM first. One visible: fix the test with a visible-scoped selector. Two visible: fix the app architecture                                                                                                                                                                                                                                                                                                                          |
| `blocking-route` fires even though a parent layout has `<Suspense>` around `{children}`   | Validation is segment-scoped because navigations are segment-scoped: sibling navs within a shared layout only re-render the changing leaf, so a parent's boundary never fires. Move the boundary into the suspending segment itself or its `loading.tsx`. The runtime message "outside of `<Suspense>`" reads as "outside of a Suspense within this segment."                                                                                                                   |
| Added `loading.tsx` at a parent segment, fallback works from outside but warning persists | Expected. Parent `loading.tsx` fires only on navigations that mount that parent fresh (e.g. `/about` → `/dashboard/settings`); sibling navs within the same parent (`/dashboard/overview` → `/dashboard/settings`) re-render only the changing leaf, which has no local fallback. Move the `loading.tsx` next to the suspending page (`<segment>/loading.tsx`) or wrap the data access in `<Suspense>` inside the page itself so every navigation source gets an instant shell. |
| Blank captured shell                                                                      | Inspect parent layout/provider/null fallback and verify the rewritten owner matches generated params before editing page skeletons                                                                                                                                                                                                                                                                                                                                              |
| Wrong route/variant shell                                                                 | Prove rewrites and owner; do not render multiple candidate shells and hide one                                                                                                                                                                                                                                                                                                                                                                                                  |
| Persistent shared layout resuspends on client nav                                         | Fix route/layout architecture; check changing parallel slots, keyed subtrees, or client mount gates before tuning child fallbacks                                                                                                                                                                                                                                                                                                                                               |
| Visual layout drift                                                                       | Fix shared frame or fallback box model before changing tolerance                                                                                                                                                                                                                                                                                                                                                                                                                |

## Faster Triage Moves

- When captured HTML is blank, inspect the highest layout/provider that can suspend before reading page skeleton code.
- When the same shared layout should survive client navigation, prove whether the frame itself remounted before inspecting nested Suspense.
- When a client component reads search params or router state, wrap it (or extract an inert fallback with the same box model).
- When a mounted client shell returns `null`, check whether an inert frame should reserve layout space while the shell is captured.
- When a devtools panel or toast shifts screenshots, hide only known devtool containers in the harness. Keep diagnostic collection separate from screenshot pixels.

## Escape Hatches

Pick the smallest hatch that unblocks the work, in this order:

1. `unstable_disableDevValidation: true` — silence dev noise on a route you plan to fix; build stays strict.
2. `unstable_disableBuildValidation: true` — keep dev warnings but stop blocking CI while you stabilize.
3. `unstable_disableValidation: true` — skip validation on this subtree entirely.
4. `export const unstable_instant = false` — whole-route opt-out.
5. `connection()` — force the route dynamic.

Any of these need user approval and a recorded tradeoff. A test that passes only because `connection()` forced a fallback is proving the workaround, not the intended architecture.
