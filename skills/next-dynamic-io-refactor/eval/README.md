# Self-eval — does the skill make the agent smarter?

A **differential** harness. The thesis it exists to prove:

> A capable default agent, on its own, can't correctly refactor a messy
> `cacheComponents` app — it either fails to build, or makes the build pass by
> **collapsing the whole page into one `<Suspense>` / `loading.tsx`** (a blank,
> coarse shell). **With this skill**, the same agent reaches a **maximal static
> shell**. If that gap holds, the skill is doing real work.

So the eval doesn't just check "did it build" — a naive agent can pass the build
by widening boundaries. It runs the **same headless `claude -p`** twice on the
same broken app, once **without** the skill and once **with** it, and scores the
**quality of the resulting shell statically**.

## Run

```bash
node skills/next-dynamic-io-refactor/eval/run.mjs              # full differential
node skills/next-dynamic-io-refactor/eval/run.mjs --baseline-only   # just prove the messy app breaks
node skills/next-dynamic-io-refactor/eval/run.mjs --arm with-skill  # one arm
node skills/next-dynamic-io-refactor/eval/run.mjs --skip-install    # reuse the install on reruns
node skills/next-dynamic-io-refactor/eval/run.mjs --model opus --keep
```

Requires: Node ≥ 18, network access (installs **latest `next@canary`** + React
canary into a throwaway temp dir), and the `claude` CLI on PATH. Nothing is
installed into this repo — each arm runs in its own copy under an OS temp dir,
printed at the end.

## What it does

| Step | Expectation | Why |
| ---- | ----------- | --- |
| 0 install canary | — | pin the oracle to the latest pre-stable build |
| 1 **baseline** build of the untouched `messy-app/` | **FAIL** | proves the "before" is genuinely broken — the differential's floor (cf. "prove the RED" in the runtime skills) |
| 2 arm **no-skill** | `claude -p` with a plain prompt (goal + fairness guardrails, no method) → build → score | the agent's unaided ability |
| 3 arm **with-skill** | `claude -p` pointed at `SKILL.md` → build → score | the agent + the method |
| 4 **verdict** | with-skill maximal ∧ no-skill not | the skill is differentiating |

Both arms get the **same goal and the same fairness guardrails** ("keep
`cacheComponents` on, keep every route's real content") — the *only* difference
is whether the skill's methodology is available. That isolates the skill's
contribution.

## How it's scored (statically) — two tiers

After each arm, `scan.mjs` re-runs on the result and the build log is parsed. A
plain build-pass isn't enough — a strong model can clear naive bars on its own —
so the score has two tiers:

**Tier 1 — CORRECT (maximal shell).** All of:

- **builds** clean (no dynamic-IO errors)
- **kept `cacheComponents: true`** — didn't "fix" it by disabling the feature
- **all routes still present** — didn't delete/blank routes to pass
- **0 HIGH scan candidates remain** — no uncovered dynamic reads left
- **`generateStaticParams` on `/blog/[slug]`** — enumerable param enumerated
- **`'use cache'` used somewhere** — shared data cached (scanned across `app/` +
  `lib/`, not just the route tree)
- **≥1 real (non-blank) granular fallback**

**Tier 2 — QUALITY.** CORRECT **and** the caching is production-correct:

- **`cacheLife(...)`** present — explicit lifetime, not the default profile
- **`cacheTag(...)`** present — cached data is invalidatable

The differential is the **gap between tiers**: the skill is differentiating when
with-skill reaches a strictly higher tier than no-skill.

### Observed result (next@16.3.0-canary.40)

| arm | build | shell | `cacheLife` | `cacheTag` | tier |
| --- | ----- | ----- | ----------- | ---------- | ---- |
| baseline | ❌ | — | — | — | (floor) |
| no-skill | ✅ | maximal | **no** | **no** | CORRECT ◐ |
| with-skill | ✅ | maximal | yes | yes | **QUALITY ✅** |

A strong unaided agent reaches a maximal shell but caches **crudely** — a bare
`'use cache'` with no `cacheLife`/`cacheTag`, so the data is stale-forever and
can't be invalidated (a real production defect). It also tends to **recreate the
shell** in fallbacks (duplicating `{children}` inside a `<Suspense fallback>` —
causing remount/CLS). The skill drives correct, invalidatable, granular caching.
That gap is the proof. To push the gap to a build-level failure, add a harder
trap to the fixture (e.g. a per-user path the naive "cache the shared helper"
shortcut would corrupt).

## The fixture (`messy-app/`)

One small app, six planted dynamic-IO defects — one per lever:

| File | Defect | Lever the skill applies |
| ---- | ------ | ----------------------- |
| `app/dashboard/layout.tsx` | top-level `await cookies()` gating the dashboard subtree | pass the promise down (layout variant) |
| `app/page.tsx` | top-level `await` of uncached shared data; LCP buried | `'use cache'`; keep `<h1>` in the shell |
| `app/blog/[slug]/page.tsx` | no `generateStaticParams`; top-level `await params` + post + comments | root-param + `gsp`; cache the post; stream comments |
| `app/blog/[slug]/loading.tsx` | coarse page-mirroring segment skeleton | decompose into per-region fallbacks |
| `app/search/page.tsx` | top-level `await searchParams` | isolate behind `<Suspense>` |
| `app/dashboard/page.tsx` | top-level auth gate (`cookies()` → redirect) + per-user data | defer the gate; stream the data |

The **root** `app/layout.tsx` is deliberately kept clean — a dynamic read there
crashes the build globally (it runs for Next's internal pages too), which would
mask the per-route lessons.

To make the bar harder over time, add routes/defects here and tighten the score
rubric in `run.mjs`.

## Reading the output

Each arm leaves its refactored code + `build.log` + `claude.log` (+ `.prompt.txt`)
in `<workdir>/<arm>/`. Diff `no-skill/` against `with-skill/` to *see* the
difference in approach — that diff is the artifact that backs the "skill is
smart" claim.
