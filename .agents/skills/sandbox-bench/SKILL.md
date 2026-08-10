---
name: sandbox-bench
description: >
  Benchmark React or Next.js changes on Vercel Sandbox VMs with paired
  A/B statistics: react PR/commit vs base, or Next.js PR/commit vs base,
  measured end-to-end through the bench/render-pipeline app (rps,
  latency, p95; TTFB, RSS and document/Flight bytes when the Next
  side captures them) and, for React changes, through the react
  repo's flight-ssr-bench fixture (Node AND Edge web-streams paths,
  Fizz and Flight+Fizz). Use whenever the user asks to bench, perf
  test, or A/B a React PR, a react-server-dom / Flight / vendored React
  change, or a Next.js PR ("is this PR faster", "does this regress
  RSC?", "measure the perf impact of <commit>"), even if they don't say
  "benchmark" — any request to quantify a server-side performance
  difference between two revisions belongs here. Runs remotely
  (laptop-free), applies correctness gates before measuring, and
  reports boot-level confidence intervals.
metadata:
  internal: true
---

# Sandbox bench: paired A/B perf runs for React and Next.js changes

Measures what a change is actually worth, end to end: two revisions
("arms") built into otherwise-identical Next.js apps, exercised by the
`bench/render-pipeline` harness on Vercel Sandbox VMs, compared with
paired statistics that treat the VM boot as the unit of replication.
All heavy work happens on sandbox VMs; the laptop only orchestrates.

Scripts live in `scripts/` next to this file and run from anywhere.
Arms are git refs, resolved in cached clones of react and next.js;
the Next side defaults to canary. Everything is cached
content-addressed: first use of a new pair builds caches (~45-60 min
extra, once); later runs boot straight into measurement.

## One-time setup

1. `node scripts/config.mjs show` — if it reports NOT CONFIGURED, ask
   the user which Vercel **team** and **project** the sandbox VMs
   should run under (these are billed resources; never guess, never
   default), then `node scripts/config.mjs set team=<slug> project=<name>`.
   Config lives in `~/.config/sandbox-bench/config.json` — never commit
   team/project names into the repo.
2. The Vercel CLI session must have access to that team. On a 403,
   stop launching (don't retry through it) and check whether access is
   already back: `vercel whoami --scope <team-slug>` plus one scoped
   read call (e.g. `vercel sandbox ls`) — grants drop and recover on
   their own, and a transient 403 needs no login at all. If
   verification still fails, run `vercel login <team-slug>` yourself
   as a background task (the token lives with the CLI session, not
   with the user). It opens a browser/device confirmation — relay the
   URL if one is printed — but keep re-running the verification pair
   every minute or two while it waits: access often returns before
   the login flow reports success, and once verification passes, kill
   the pending login and resume. After a 403 outage, expect in-flight runs to have died:
   run `node scripts/bench-status.mjs` and follow its recovery
   actions (measurement VMs will have hit their ~5h timeout if the
   outage was long — those cells need relaunching, not collecting).
3. react and next.js clones land in the cache on first use (or point
   `reactRepo`/`nextRepo` in the config at existing checkouts).

Before the first real run with a new configuration, sanity-check the
plan with `--dry-run` (prints what would happen, touches nothing).

## Workflow

### 1. Resolve what's being compared

- **React PR**: `--pr <url|number>` — base is computed automatically
  (merge-base of the PR head with react main).
- **React refs**: `--arms base=<ref>,cand=<ref>` — base FIRST. For a
  multi-commit branch, base is the merge-base with main, not `cand^`.
- **Next.js PR**: `--next-pr <url|number>`. The React side defaults to
  whatever each Next ref vendors (that's what would ship); pass
  `--react-ref` only to pin both arms to one specific React build.
- **Next refs**: `--next-arms base=<ref>,cand=<ref>`.

Exactly one side varies; the other is identical in both arms. That
isolation is what makes the numbers attributable — never vary both.

### 2. Gate correctness before spending bench compute

A bench number from an arm that fails its own tests is meaningless.
For any arm that is not already CI-green upstream (hand-assembled
branches, cherry-picks with resolved conflicts, local commits):

```sh
node scripts/sandbox-gate.mjs --arms cand=<ref>
```

The bench itself enforces the primary gate: every react arm's commit
must have green CI on the react repo, checked automatically before any
build or VM is spent. PRs and main-history commits normally satisfy
this with no extra work. For local or unpushed refs (no CI exists),
gate on a VM with sandbox-gate.mjs and then pass --allow-ungated to
the bench. The VM gate runs the full test suite in prod mode (the
channel that gets benched). PASS requires seeing the actual test
counts in the output. If a gate fails, report the failures and stop —
do not bench a broken arm. Each arm is gated in its own
lockfile's environment. Bench the exact sha the gate prints (a branch
ref can move between gate and bench).

### 3. Launch the bench (background, non-blocking)

```sh
bash -c 'node scripts/sandbox-e2e.mjs --pr <url> --label <slug> \
  2>&1 | grep --line-buffered -v "^live "; exit ${PIPESTATUS[0]}'
```

For React PRs, launch BOTH suites (separate background tasks; they
share arm builds and caches):

```sh
bash -c 'node scripts/sandbox-ssr.mjs --pr <url> --label <slug>-ssr \
  2>&1 | grep --line-buffered -v "^live "; exit ${PIPESTATUS[0]}'
```

The e2e suite measures the Node path through a real Next.js app; the
ssr suite measures the react repo's flight-ssr-bench fixture — 8
variants (Fizz and Flight+Fizz, Node and Edge web streams, sync and
async), each sequentially with Flight script injection and behind an
HTTP server at c=1/c=10. Edge cells are the ssr suite's headline (the
e2e suite cannot see that path); its Node and Fizz-only cells
attribute an effect to the Flight layer, the Fizz layer, or the
stream plumbing. The fixture (the workload) is pinned to one ref for
both arms — react main by default — so only the React builds differ;
if the PR itself edits the fixture, the launcher says so and the run
does not measure those edits. Next PRs run the e2e suite only.

- Run it as a background task and proceed on its completion
  notification. Never hold a foreground wait; never poll in a loop —
  the rule is about control flow, not status relay: reading the
  output tail to answer "how's it going" is always fine.
- The harness handles the invariants internally: both arms in the same
  VM, interleaved ABBA, paired per (vm, run); detached remote
  execution (transport drops don't kill runs); build fingerprints
  recorded in every result row.
- `live ...` lines are streaming estimates for progress display only.
  Never stop a run early because a live p-value looks good, and never
  report a live number — sequential peeking manufactures false
  positives. Only the final analysis counts.
- Defaults (16 VMs × 2 paired runs) implement the methodology; don't
  reduce VM count to save time — boots are the unit of inference, and
  fewer boots means wider intervals, not faster answers.
- Sandbox compute is internal capacity, not a budget: launch, relaunch,
  and confirm runs without asking about cost or shrinking them to
  save it.
- The Next side's default, `canary`, is the latest published canary
  release (the launcher prints its version and sha), so repeat benches
  reuse the built snapshot until a new canary ships.
- Useful flags: `--bench-env KEY=VALUE` (runtime-only env for the
  bench process — it does NOT affect the snapshot's app build), `--isolate-routes`
  (tail investigations), `--no-profile` (skip the CPU capture that
  runs by default after the timed runs), `--prepare` (build caches
  only — use when two cells will share an arm, to avoid duplicate
  builds racing).
- CPU profiles are captured by default: one profile pass per arm runs
  strictly AFTER the timed runs (it cannot touch the numbers), costs
  ~45-60 min extra VM wall-clock, and lands in `<runDir>/prof-vm<N>/`
  as standard V8 `.cpuprofile` files. Cross-VM profile diffs are
  highly stable (observed 16/16 sign agreement on real movers), so one
  profiled cell suffices to rank hot paths. Analysis caveats:
  aggregate by (functionName, line, column) — bare minified names
  collide across the bundle — and never diff arms by minified name
  (the minifier renames between builds); match positions or code
  snippets instead.
- The bench exercises Next's node-streams path
  (`__NEXT_USE_NODE_STREAMS` is inlined as true for the node runtime
  at build time). React changes that only touch the EDGE stream
  configs are not exercised end-to-end and will (correctly) bench as
  no detected difference.

### 4. Read the result like a skeptical data scientist

The goal is the truth about the change, not making its author feel
good. The final analysis prints, per route/phase/metric, the
boot-level mean, ±95% CI, and p across boots. Apply the policy in
[references/methodology.md](references/methodology.md):

- Claim only boot-level p < 0.01, with the CI, on an A/A-validated
  team/config (see methodology).
- The PR is a hypothesis, not an explanation. Claims come from the
  analysis output alone. When the numbers agree with the PR's story,
  check whether the captured data actually discriminates that
  mechanism from alternatives — a latency win attributed to smaller
  payloads should come with a document-bytes delta; if the bytes
  didn't move, the story doesn't hold and the report says so.
- Use every captured metric, and voice anything that does not add up:
  one metric family moving against the others, effects with no
  byte-level or RSS trace, throughput moving without latency,
  sign flips across boots. An inconsistency you cannot explain
  belongs in the report, not in the drawer.
- The `within-run p` shown in brackets is a diagnostic, never a claim.
- Check the fingerprint header first: two distinct fingerprints = valid
  A/B; "inconsistent fingerprints" = invalid, report no numbers. The
  fingerprint hashes both bundlers' compiled server files — arms
  touching only client files can still legitimately show identical
  fingerprints with different version strings.
- Per-boot values are printed; if boots disagree in sign, say so.
- Any claim that will drive a decision gets one independent
  confirmation run before it's stated as fact.

Re-analyze any past run without re-running it:
`node scripts/bench-analyze.mjs <runDir>`.

### 5. Report

Name what was measured with links: the PR title (printed in the
analysis header, stored in meta.json) linking to the PR; for ref
arms, the commit title. Lead with a table of the significant cells,
each row carrying the effect with its unit, the CI, and p:

```
## [<PR title>](<PR url>) — e2e, Vercel Sandbox (x86 Xeon), <n> boots

Significant (boot-level p < 0.01, A/A-validated):
| cell | effect | 95% CI | p |
|---|---|---|---|
| /dashboard under load | +14.4% throughput (req/s) | ±3.2% | <0.0001 |
| /dashboard serial | −10.7% median latency (ms) | ±0.6% | <0.0001 |

No detected difference: <every cell not in the table, by name>.
Flags: <cells at 0.01 ≤ p < 0.05, sign disagreements across boots,
fingerprint caveats, anything that does not add up>
```

One row per cell: rps and median restate each other, so report the
throughput number (add a p95 row only when the tail moves differently
from the median). Document metrics (raw/gzip/Flight KB) get their own
rows when they differ — they are the mechanism evidence. When the
Next side predates the document-metrics harness (vercel/next.js#95828)
those cells are absent; say so instead of silently reporting less. State the platform next to the numbers. Magnitudes
are platform-dependent (GC share differs by CPU); direction and
mechanism transfer, percentages do not. Never present a
noise-compatible delta as a small win or loss — it is "no detected
difference".

## Results database

Every collected run lands in one SQLite file,
`~/.cache/sandbox-bench/results.db` — raw measurements and artifacts
(CPU profiles, logs) only, written exclusively by the importer, never
by hand. The launcher imports and verifies automatically at
collection; `bench-analyze` reads the db and nothing else, so every
statistic is a pure function of it. Numbers in reports come from the
analysis output verbatim — never retype, recompute, or aggregate them
yourself.

- `node scripts/bench-db.mjs ls` — all runs with sample/artifact counts.
- `node scripts/bench-db.mjs verify [runId]` — integrity checks:
  sqlite-level, referential, one fingerprint per arm, paired sample
  counts, artifact sha256. Run it before drawing on old data.
- `node scripts/bench-db.mjs export out.db <runId...>` — cut a
  self-contained db of specific runs (with their profiles) to send to
  someone. It opens in any SQLite tool.
- `node scripts/bench-analyze.mjs <runId>` — re-analyze anything in
  the db; a run-dir argument imports it first.

## Keeping the user informed

The launcher narrates itself on stdout: launch facts first (run dir,
arms, CI verdicts), then a progress line every ~2 minutes with rows
collected and interim per-route effects with confidence. Relay to the
user: the run dir and expected duration right after launching,
notable interim shifts if they ask how it's going, and the full
verdict from the final analysis when the completion notification
arrives. The analysis names metrics that were `not captured on this
run` — repeat that in the verdict when it limits what the data can
say (document metrics absent means the payload mechanism is
unverified, not verified-identical).

While a run is active, open any reply with a one-line status per run:
read the tail of the launcher's output and quote its latest progress
line. If the session supports timed wakeups or reminders, schedule a
check at each expected transition (arm builds -> experiment snapshot
-> measuring, then every ~15 minutes of measurement) and post the
progress line; if not, say when the next update will arrive so
silence is never ambiguous. Interim effects in progress lines are
streaming estimates — share them as progress, never as claims.

If a launcher process dies (session teardown, crash), the remote VMs
keep executing their measurement loops — the data is not lost. `node
scripts/bench-collect.mjs <runDir>` reconnects, waits for the loops,
downloads the results, cleans up, and analyzes. Run it before the VMs
hit their ~5h timeout.

## Failure recovery

- **First move, always: `node scripts/bench-status.mjs`.** Session
  restarts silently kill background launchers while their detached VMs
  keep measuring, and a dead launcher's log still ends with a
  healthy-looking progress line — never infer liveness from log tails
  or task output files. bench-status checks each run's recorded
  launcher pid and prints the per-run recovery action (running /
  collect now / relaunch). Run it at the start of any session that
  expects work in flight, after any crash, and before telling the user
  what is or isn't running. Launcher crashes are also recorded in the
  run's status.json (`phase: "failed"` plus the error).
- **Interrupted local process**: remote VMs keep running detached.
  `vercel sandbox list` (with the configured team/project) to find
  them; poll each VM's `/vercel/sandbox/loop.done`, `cp` its
  `results.jsonl` down when done, then remove the VM and analyze with
  `bench-analyze.mjs`.
- **Leaked VMs** after any crash: `node scripts/sandbox-sweep.mjs`
  lists this skill's VMs (matched by sbench-\* name AND the
  purpose=sandbox-bench tag, and only when older than --min-age-hours,
  default 3, so healthy in-flight runs are never touched); `--yes`
  removes them by exact listed name.
- **Flaky uploads/transports**: the harnesses size-check artifacts and
  abort on truncation. A failed cell is safe to relaunch; caches make
  the retry cheap. Don't relaunch two cells that need the same uncached
  arm at the same moment — they'll race to build it; use `--prepare`
  first instead.

## Cost expectations (set these with the user before big runs)

Per cell at defaults: ~18 VMs (8 measurement + build/snapshot VMs),
~1-2h wall-clock cold, ~30-60 min warm. A/A calibration and
confirmation runs are extra cells. VMs are billed to the configured
team — for anything beyond a single PR check, confirm scope first.
