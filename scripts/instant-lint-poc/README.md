# instant-lint (proof of concept)

A static, conservative approximation of Cache Components' instant-navigation
validation: build a module graph from each route segment entry (page/layout/
default), find render-reachable `await`/`use()` sites, classify them against
the runtime's own taxonomy, and check that every potentially-blocking site is
below a `<Suspense>` boundary or inside a `"use cache"` scope — emitting the
same `[stream]` / `[cache]` / `[block]` remedy menu as the dev overlay's
Instant Insights fix cards.

```bash
node scripts/instant-lint-poc/analyze.mjs scripts/instant-lint-poc/fixtures/app
node scripts/instant-lint-poc/analyze.mjs <your-app-dir> --json
```

The only dependency is the repo's own `typescript` devDependency (parser,
JSX support, and module resolution in one package). This is a **proof of
concept for a design discussion**, not a product: the production home for
this analysis would be Rust on Turbopack's module graph (see
"Productionization" below).

## Why this exists

Instant Insights (`experimental.instantInsights`,
`packages/next/src/server/app-render/instant-validation/`) already validates
instant navigations — but it does so by **rendering**: after each dev
response it simulates a navigation at every URL-depth × route-group-depth
boundary, SSR-prerenders the combined payload, and regex-matches React
component stacks to decide whether each dynamic hole sits below `<Suspense>`.
That design is semantically exact (it observes what actually settles), but it
has structural costs that a static pass directly complements:

1. **Attribution.** The runtime can only know *that* something suspended,
   not *where and how* ("because of macrotasks"). Component stacks go
   missing (`React.cache`, `generateMetadata` dedupe), and a sequence of
   awaits used to be attributed to the *last* one instead of the first
   (fixed in #96343 by "a workaround that does more CPU work than we
   ideally would"). An AST pass is the opposite: it is *great* at pointing
   at exact await expressions and weak at knowing whether they really block.
2. **Cost and coverage.** Validation renders scale with segment depth,
   `instant = false` placement, and parallel routes (moved off the main
   thread in NAR-895, but still render-shaped work), and they run only when
   you actually visit a page in dev — an unvisited route regresses silently.
   A static pass is milliseconds per segment, runs in CI or an editor, and
   covers every segment including conditional branches the validation
   render's samples never executed (validation is path-dependent; see
   `errors/blocking-route.mdx`).
3. **Opt-out hygiene.** The `cache-components-instant-false` codemod
   blanket-inserts `export const instant = false` for incremental adoption,
   and each one silently disables validation for its subtree. Nothing today
   tells you when an opt-out has become unnecessary. Proving "this segment
   can no longer block" is exactly the kind of conservative claim static
   analysis can make.

The inverse is equally true, so this must be a **complement, not a
replacement**: "blocking" is defined operationally, not syntactically. The
final prerender runs inside an atomic timer group
(`app-render-scheduling.ts`) where no real I/O completion can ever be
delivered — a promise blocks iff it fails to settle within that window.
Identical syntax diverges at runtime, and blocking happens with no `await`
in sight:

| an `await` that does NOT block | blocking with NO `await` in the file |
| --- | --- |
| `await getCached()` where the callee is `"use cache"` (replayed from the resume-data cache) | `Date.now()` / `Math.random()` / `crypto.randomUUID()` — sync IO aborts the prerender outright |
| `await params` when `generateStaticParams` provides concrete values (fallback params hang, concrete ones resolve) | an await buried inside a library/ORM function |
| `await cookies()` in a *runtime* prefetch (resolves at the ShellRuntime stage; blocks only the static shell) | a promise created in a parent, awaited or `use()`d in a child — including a client component |
| microtask chains (`await null`), already-resolved promises | `useSearchParams()` in a client component without Suspense |
| `await fetch(url, { cache: 'force-cache' })` | `generateMetadata` / `generateViewport` doing IO |

And some blocking is invisible to any AST: a `"use cache"` entry with
`revalidate: 0` or a too-short `expire`/`stale` is *cached and still
excluded from the static shell* (`use-cache-wrapper.ts`); whether
`await navigation()` blocks depends on whether the segment was statically
optimized, which can differ per page prefetching a shared layout.

Hence the design contract: **three-valued, conservative verdicts** —
*instant* (proved), *blocking* (proved, with the exact site and remedies),
*unknown* (explicit deopt; the runtime validator remains the source of
truth). Never guess. This mirrors the TypeScript analogy the Instant
Navigations proposal itself draws: a static layer that catches the tedious
mistakes, with the render-based validator as the ground truth underneath.

## What the PoC implements

- **Module graph, not a bundler**: imports resolved with
  `ts.resolveModuleName` (Bundler resolution), lazily, per segment entry.
  No compilation, no chunking. Re-exports are followed; `node_modules` is a
  deliberate boundary.
- **Directive scopes**: module- and function-level `"use cache"` cuts
  propagation (the body replays from cache); `"use client"` stops server
  classification (only `useSearchParams()` is checked beyond it).
- **Render-path awaits**: awaits/`use()` in a component body — including
  inside JSX expressions — are classified by resolving the callee through
  the graph: `cookies()`/`headers()`/`draftMode()` and `params`/
  `searchParams` props ⇒ *runtime data* (no `[cache]` remedy, matching
  `runtimeCards`); `connection()` and uncached `fetch` ⇒ *dynamic*;
  resolved local/imported functions ⇒ recurse; unresolvable callees ⇒
  *unknown, assumed dynamic* (the Cache Components contract is
  dynamic-by-default). Nested function bodies only count if called on the
  render path; `Promise.all` classifies element-wise.
- **Boundary semantics that match the runtime**:
  - `<Suspense>` covers child **component execution**, not expressions:
    `<Suspense>{await getData()}</Suspense>` still blocks the parent, and a
    blocking component inside `fallback={…}` still blocks the shell.
  - `loading.tsx` covers the sibling `page.tsx` (the LoadingBoundary
    remounts fresh in the changed subtree) but not the layout that owns it.
  - A parent layout's `<Suspense>` is **never** consulted for a child
    segment: on client navigations an already-mounted layout's boundaries
    are revealed and don't cover new content below — which is exactly why
    per-segment analysis is the right unit.
  - `export const instant = false` suppresses blocking findings
    (`isPageAllowedToBlock`) — except sync IO, which the runtime hard-fails
    before the `allowEmptyStaticShell` bypass. When a segment declares
    `instant = false` and nothing can block, the analyzer suggests removing
    the stale opt-out.
- **Honest deopts**: `await new Promise(…)` ("await is easy, it's
  `new Promise(() => …)` that is hard") is reported as *unclassifiable*,
  not guessed at.

The `fixtures/app` directory is the demo matrix — each route's header
comment states the expected verdict, including the adversarial cases
(`laundered/`, `sync-io/`, `unknown-io/`) chosen specifically to show where
the analyzer refuses to overclaim.

## Where static analysis must give up

Documented here so nobody mistakes the PoC's clean fixture run for
solved-problem status:

- **Hand-constructed promises** and promisify wrappers
  (`new Promise((res, rej) => params.then(res, rej))`) launder
  classification. Deopt.
- **Conditional paths**: `if (flag) await io()` — static analysis is
  conservative over all branches (an advantage for coverage, a false-positive
  risk when the branch is unreachable in practice, e.g. behind
  `notFound()`/`redirect()` control flow).
- **cacheLife thresholds**: `revalidate: 0` / short `expire` keep a cached
  function shell-blocking; only literal `cacheLife()` arguments are visible
  statically.
- **Caller-dependent promises** (`await props.somePromise`,
  `await navigation()`): blocking depends on the caller/prefetch kind.
  Reported as unknown unless covered by Suspense.
- **Third-party components**: an unresolvable component could block; the PoC
  assumes it doesn't (a `--strict` mode could invert that).
- **Parallel routes / route groups / `unstable_samples`**: the runtime
  validator's boundary enumeration (`discoverValidationDepths`) and
  sample-driven renders have no static equivalent; slot-conflict semantics
  are explicitly "no compile-time way to detect".

## Productionization sketch

The PoC's TypeScript implementation is for demonstration. The real analysis
belongs in Rust, where every ingredient already exists:

- **Module graph**: Turbopack builds a per-page graph on demand in dev
  (`Project::module_graph`, `per_page_module_graph`) and `next
  experimental-analyze` already serializes per-route module graphs to
  `.next/diagnostics/analyze/data`. `find_server_entries`
  (`visit_client_reference.rs`) is the existing "walk the server graph from
  a segment entry, stop at 'use client'" primitive.
- **Directive scoping**: `server_actions.rs` already computes module- and
  function-level `"use cache"` scopes (`Directive::UseCache`); reuse it
  instead of re-detecting directives.
- **Const evaluation**: `segment_config.rs` already partially evaluates
  `export const instant` per loader-tree file with `eval_context.eval` —
  stronger than the JS-side literal extractor.
- **Precedent for instant-aware AST work**: `debug_instant_stack.rs`
  (locates `export const instant`, injects a dev-only stack factory).
- **What's genuinely new**: JSX/Suspense-boundary awareness. No transform in
  the repo models "below a `<Suspense>`" — it's component-tree-shaped, not
  module-graph-shaped, and is the core novel piece.

Surfacing: emit findings as insights through the existing overlay taxonomy
(`instant-guidance-data.ts` kinds/cards) and the MCP `get_errors` surface, so
agents and humans see one vocabulary. Two integrations look highest-value:

1. **Attribution assist (hybrid mode)**: when the runtime validator detects
   a blocked segment but has a poor stack, the static pass ranks the
   segment's candidate blocking sites — pairing the runtime's *whether*
   with the AST's *where*.
2. **Pass-skipping**: if the static pass proves a subtree touches no
   runtime data (no `cookies`/`headers`/params reachability), the dev
   validator can skip that segment's runtime-stage validation render —
   same shape as skipping passes based on which stage emitted chunks.

Not recommended: ast-grep (single-file pattern matching — no module graph,
no directive scopes) and a standalone ESLint rule (same limitation;
`eslint-plugin-next` has no cross-file infrastructure). An ESLint *surface*
could later wrap the Rust analysis, the way typed lint rules wrap tsc.
