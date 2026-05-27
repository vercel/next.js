# Diagnostic Loop

Use this when Instant work drifts, a shell is blank, the wrong boundary appears, or diagnostics feel noisy.

## Source Priority

1. Next route-specific diagnostics from Next DevTools, framework diagnostics, or dev stdout.
2. Browser page errors and console errors captured before navigation.
3. Locked DOM from `instant(page, ...)`.
4. Screenshots and visual judgment (last).

Screenshots show what happened; diagnostics show why.

For large saved logs:

```bash
scripts/extract-instant-diagnostics.mjs path/to/dev.log path/to/trace.network
```

Treat the script output as a shortlist; still read surrounding context when the first blocker is ambiguous.

## Current-Blocker Format

Keep a short note while iterating; rewrite after each run. If the diagnostic changes, drop the old theory.

```text
Route:
Mode: initial load | client nav
Variant tuple:
Released route status:
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
Level 0: locked shell is not blank and does not crash.
Level 1: persistent chrome is correct for the route state.
Level 2: route title and primary frame match released UI.
Level 3: first content region has route-owned local placeholders.
Level 4: locked-shell geometry matches released UI within tight tolerances.
```

## Diagnostic Reading Rules

- Prove the released route works outside the Instant lock before treating Instant failures as Instant evidence.
- Read the first route-specific stack frame before editing. The actionable frame is usually the first component that reads `cookies()`, `headers()`, `params`, `searchParams`, `useSearchParams()`, an uncached fetch, or a request promise.
- If Next reports that validation could not complete because rendering failed, fix the render error first.
- If dev stdout collapses the only useful stack to `at ignore-listed frames`, restart dev once with `__NEXT_SHOW_IGNORE_LISTED=true` and rerun the same probe.
- Keep the full dev stdout for that rerun and re-read the tail after exit. Stack-overflow formatting can emit a generic React/Next stack first and an app-owned code frame after flush.
- If dev logs are quiet but the shell is wrong, inspect `loading.tsx/jsx` on the route path. A segment loading boundary can catch the suspension and hide the more actionable diagnostic.
- If `instant(...)` returns 200 but the locked body is empty, compare the rewritten internal owner against each dynamic segment's `generateStaticParams()` before editing UI. A non-generated dynamic param produces an empty locked shell.
- If the browser overlay reports an error that source search and typecheck do not back up, restart dev once before editing again. After route-file experiments, parallel-route changes, `generateStaticParams()` edits, or import-graph changes, try a fresh `.next` rerun before treating the next Instant result as source truth.
- If a missing-data route throws `notFound()` but stays on the loading shell, inspect whether PPR/parallel-route streaming already served the page as a 200 shell. Returning a route-owned not-found component directly from the missing-data branch can be the right product fix; document the HTTP semantics tradeoff.

## Build And Prerender Triage

Use production-like build output as a separate oracle from dev Instant tests.

- Build can surface routes the focused suite never touched; a green focused test does not mean shared layout/provider work is build-safe.
- Run build with the app's supported Node version; an unsupported local Node turns actionable errors into ignore-listed exceptions.
- After the focused Instant test passes, run a local production-like build before waiting on a Vercel deployment. Use Vercel logs for confirmation or platform-only failures.
- When build reports `blocking-route`, classify the route first: product shell, standalone utility, auth handoff, admin/debug, redirect-only, or data page.
- If build reveals one blocker per run, keep a blocker manifest (route, owner, failure class, next fix) so progress survives each rerun.
- Filter noisy build logs. Warnings about unrelated services, duplicate native libraries, or background streaming errors should be recorded separately from the first route-specific blocker.
- If build fails in translation code, verify the locale provider, server locale, and missing-key fallback shape before treating it as an Instant blocker.

## Ownership Checks

- Compare visible URL with middleware, proxy, rewrites, route groups, and parallel slots. A public URL may render through a hidden internal route tree.
- Prove the captured owner with a stable route marker or locked DOM evidence before refactoring UI.
- For shell generation that depends on root variant identity, use the `next/root-params` generated getter API. Treat `props.params` reads in root or shared layouts as suspect until the focused Instant probe proves they do not trigger `NEXT_STATIC_GEN_BAILOUT`.
- If a parent root/layout fallback captures before the target route, fix the parent boundary first. Do not tune child skeletons and call the work done.

## Failure Taxonomy

| Symptom                                           | Most likely cause                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blank locked body                                 | Parent layout/provider/runtime read suspends before a visible fallback can render, or the rewrite targeted a dynamic owner param not generated for Instant capture |
| Route 500 in Instant only                         | Dev stdout has the blocking-route diagnostic or a render error preventing validation                                                                               |
| Normal route also fails                           | Not an Instant result yet; fix the released route                                                                                                                  |
| Wrong owner captured                              | Inspect rewrites, hidden segments, parallel routes, parent fallbacks                                                                                               |
| Provider crash in fallback                        | Fallback rendered real children/slots/client hooks without the released provider stack                                                                             |
| `useSearchParams()` warning                       | Move that client component under a local Suspense boundary                                                                                                         |
| Hidden duplicate DOM                              | Multiple candidate shells rendering; fix architecture, do not just loosen locators                                                                                 |
| Persistent chrome resuspends on client nav        | Shared frame lives inside a changing parallel slot, keyed subtree, or mount-gated client shell                                                                     |
| Persistent list resuspends after frame stabilizes | Data continuity problem (SWR keys, request de-dupe), not frame ownership                                                                                           |
| Geometry mismatch                                 | Inspect box-model deltas before changing tolerance                                                                                                                 |
| Dev passes but preview janks                      | Check CSS load order, deployment protection, theme/auth cookies, production-only prefetch behavior                                                                 |

## Faster Triage Moves

- When locked HTML is blank, inspect the highest layout/provider that can suspend before reading page skeleton code.
- When the same chrome should survive client navigation, prove whether the frame itself remounted before inspecting nested Suspense.
- When a client component reads search params or router state, wrap it (or extract an inert fallback with the same box model).
- When a mounted client shell returns `null`, check whether an inert frame should reserve layout during the Instant lock.
- When a devtools panel or toast shifts screenshots, hide only known devtool containers in the harness. Keep diagnostic collection separate from screenshot pixels.

## Escape Hatches

Use `instant: false` or `connection()` only after explaining the tradeoff and getting user approval. A test that passes only because `connection()` forced a fallback is proving the workaround, not the intended architecture.
