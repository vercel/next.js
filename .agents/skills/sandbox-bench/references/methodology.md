# Statistical methodology

The design decisions below are what make the numbers trustworthy.
They follow standard rigorous-benchmarking practice (Kalibera & Jones,
"Rigorous Benchmarking in Reasonable Time"; Georges et al.,
"Statistically Rigorous Java Performance Evaluation"; JMH's forks
model) — don't relax them to save wall-clock without understanding
what they protect against.

## The VM boot is the unit of replication

JIT state, code layout, GC rhythm, host hardware, and phase order are
random effects fixed at boot time. Iterations within a boot share all
of them, so they are not independent samples — treating them as
independent produces confident nonsense (a p<1e-4 effect in one run
that vanishes in the next). The harness therefore:

- computes each metric's delta per boot (mean of that boot's paired
  within-boot deltas), and
- runs t-based inference across boots (`bench-stats.mjs`); the CI and
  p-value you see are boot-level.

The `within-run p` printed in brackets is a diagnostic only. It tells
you the pairing worked; it cannot support a claim.

Allocation follows from this: more boots × fewer runs beats fewer
boots × more runs at fixed budget, and boots run in parallel — adding
them costs money, not wall-clock, so don't be shy with them when
sensitivity matters (CI shrinks with sqrt of boots). Defaults: e2e 16
VMs × 1 block × 2
runs. Both arms always run in the SAME VM, interleaved ABBA, paired
per (vm, run) — hosts differ by up to ~20%, so cross-VM comparisons
are meaningless; VMs exist to replicate, not to compare.

## Claims

- A claim requires boot-level p < 0.01, reported with its CI, on a
  team/config whose boot-level inference an A/A run has validated.
- Anything that will drive a decision (merge, revert, ship) gets one
  independent confirmation cell first (standard perf-CI practice —
  Mozilla/Chrome retrigger, MongoDB change-point detection — nobody
  alerts off one detection).
- Everything else is "noise-compatible", reported as no detected
  difference — not as a small effect.

## Percentiles

A per-run p95/p99 from a small load phase is a near-max order
statistic, not a distribution estimate. Compare percentiles only at
boot level; p99 needs ~1k+ samples per boot to mean anything at all.
Tail effects are also where phase carryover lives (a route's serial
tail depends on the previous route's load phase) — investigate tails
with `--isolate-routes`, which restarts the server between routes.

## A/A validation

Before claiming anything on a new team/config/suite, run an A/A cell
(same ref as both arms) at default allocation:

```sh
node scripts/sandbox-e2e.mjs --arms base=<ref>,cand=<ref> --label aa
node scripts/sandbox-ssr.mjs --arms base=<ref>,cand=<ref> --label ssr-aa
```

The A/A validates the inference itself. With identical arms, expect
about (number of metric-cells x 0.01) cells at p < 0.01 by chance —
under 1 for the e2e suite's ~24 cells, roughly 1 for the ssr suite's
~88. The pass criterion is therefore two runs: a suite fails its A/A
when any cell reaches p < 0.01 with the same sign in both (a bias
tied to the arm label recurs; chance does not), or when any single
cell lands beyond the familywise bar (p < 0.01 / number of
independent variant-x-phase cells). A failing cell means boots are
sharing label-correlated conditions and the CIs are too narrow — find
the mechanism before claiming; a magnitude gate is not a substitute.
The A/A CIs also tell you what effect sizes this config can resolve.
Re-run the A/A when the platform changes (VM hardware generation,
node version, bench app or fixture changes).

Validated so far: e2e (twice, 0/24 cells), ssr (two-run criterion:
one chance cell at p=0.0024 in run 1 dissolved to p=0.86 in run 2,
nothing recurred; runs ssr-aa2/ssr-aa3 in the results db).

## Interim progress display

The launcher's progress digest shows, per route/phase, the running rps
effect and a directional confidence — P(candidate is actually
faster/slower | boots so far), the Student-t posterior under a flat
prior (not a p-value). It appears from 4 completed boots. Display
only: runs complete their planned allocation, and claims come only
from the final fixed-n analysis.

## Fingerprints

Every result row records a build fingerprint (dist-file hash + version
string) read from the tree that actually served requests. The analysis
header verifies them: inconsistent fingerprints within an arm
invalidate the run (a VM measured the wrong build). Identical
fingerprints across arms with different version strings can be
legitimate — the hash covers the compiled server files, so client-only
changes don't move it; check the version strings before declaring an
accidental A/A.

## Honest reporting

- State the platform (e.g. "x86 Xeon sandbox VMs") next to any number.
  Magnitudes are platform-dependent — GC's share of request time
  scales with CPU speed — so direction and mechanism transfer between
  platforms, percentages do not.
- Print per-boot values; if boots disagree in sign, the mean is not a
  finding, and say so.
- Never conclude anything from the live streaming estimates. Peeking
  at sequential results and stopping when p looks good is a classic
  way to manufacture false positives.
