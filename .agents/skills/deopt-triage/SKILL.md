---
name: deopt-triage
description: >
  Repeatable loop for finding and fixing V8 deopt scenarios in Next.js
  runtime code using bench/deopt. Use when asked to run deopt triage, fix
  deopts or megamorphic/polymorphic ICs found by pnpm bench:deopt, resume
  deopt-fixing work, or update bench/deopt/triage/ task files. Covers
  running the tool, grouping findings into root-cause tasks, the
  mechanical-fix vs report-back policy, before/after verification, and how
  to resume the loop in a fresh session.
user-invocable: true
metadata:
  internal: true
---

# Deopt Triage Loop

A restartable workflow for driving V8 deopt findings (from `bench/deopt`,
see `bench/deopt/README.md`) to zero — or to explicit, documented
acceptance. State lives in `bench/deopt/triage/<scenario>.md` so the loop
can be split across sessions: any session picks up where the last left off
by reading that file.

Related skills: `$v8-jit` (what the findings mean and the fix patterns).

## The loop

```
run tool → sync triage file → fan out tasks (subagents) →
  per task: investigate →
    ├─ mechanical fix  → fix → verify (before/after diff + tests) → draft PR
    └─ non-trivial     → return analysis + recommendation for the
                         maintainer to decide
→ coordinator merges reports into triage file → repeat (or stop; the file
  is the handoff)
```

## Parallelization

Tasks are grouped by disjoint root causes precisely so they can proceed
independently — investigate AND fix in parallel, one subagent per task:

- **The coordinator (main session) owns the triage file.** Subagents never
  write it; they return reports, and the coordinator merges them after each
  wave. The coordinator also runs Phase 1 and does the grouping.
- **Each fix subagent works in its own git worktree** (worktree isolation),
  with its own branch and its own draft PR. Never run two fix agents in the
  same worktree — branch and index state are per-checkout.
- **Fix PRs contain ONLY the fix, based on the default branch.** Fix
  worktrees may branch from whatever branch has the verification tool
  in-tree, but before opening the PR, rebase/cherry-pick the fix commit
  onto the default branch (`git rebase --onto origin/canary HEAD~1`) and
  push that. Never leave a fix PR based on a work-in-progress branch: its
  history gets rewritten, which makes GitHub's three-dot diff absorb the
  unrelated commits.
- **Cross-PR conflicts are acceptable.** The grouping is a reasonable-guess
  partition, not a guarantee; overlapping edits get resolved when PRs merge
  to canary. Only serialize two tasks when they undeniably rewrite the same
  construction sites (note the dependency in the triage file).
- Each subagent runs its own before/after `pnpm bench:deopt` in its own
  worktree; runs are self-contained (dynamic ports, per-worktree build
  output), so the only contention is CPU — keep the wave size modest
  (2–4 fix agents).

## Phase 1 — Run

```bash
pnpm bench:deopt --scenario <scenario> --out bench/deopt/artifacts/<scenario>-latest
```

Findings vary slightly run to run (~1 line in ~95): `Insufficient type
feedback` eager deopts are tiering-timing artifacts, and the reporter
already classifies them as `info` severity for that reason. When deciding
whether a finding "exists", prefer the union of two runs. When setting
verification criteria for a fix ("these lines must clear"), only
steady-state findings qualify — 1×-count deopts and map-deprecation
one-shots may legitimately survive a correct fix or move positions.

## Phase 2 — Sync the triage file

The triage file is `bench/deopt/triage/<scenario>.md`. If it doesn't exist,
create it from the template below. Sync `findings.txt` lines into it:

- A finding line already covered by a task (listed under any task's
  `Findings:` block): nothing to do.
- A new finding line: attach it to an existing task if it shares the root
  cause, otherwise create a new task for it (grouping rules below).
- A finding line in the file that no longer appears in two consecutive runs:
  don't delete it — move it to the task's `Resolved:` block (that's the
  evidence a fix worked, or a lead that it was noise).

**Grouping: one task per root cause, not per file.** Heuristics, in order:

1. **Same object family.** Sites touching the same property cluster (e.g.
   `slots`/`segment`/`prefetchHints`/`tree` = the RouteTree/TreePrefetch
   family) belong to one task even across files — one constructor fix clears
   all of them. Property names in the finding lines are the clustering key.
2. **Deopts follow the family they read.** A `wrong map` deopt in a function
   that reads family X belongs to family X's task.
3. **Same module** as fallback for leftovers (e.g. "misc cache-map.ts").

Keep tasks small enough that one fix (or one decision) closes them.

## Phase 3 — Pick a task and investigate

Pick the highest-severity `pending` task (eager `wrong map` deopts and
megamorphic ICs first; polymorphic ICs are informational until proven hot).
Set its status to `investigating` and note the session date.

Investigate with `$v8-jit` as the reference: read every site in the task,
find where the objects are constructed, and identify why shapes diverge
(field-order differences, optional fields added later, null vs undefined,
mixed value types, tuple arrays with mixed element kinds, objects keyed by
dynamic names). The Deopt Explorer VS Code extension on the run's `v8.log`
shows the map-transition evidence when reading the code isn't enough.

## Phase 4 — Fix or report

**Mechanical fixes — fix it and open a draft PR.** A fix is mechanical when
a reasonable maintainer would not object: it preserves semantics and public
API, doesn't restructure logic, and is reviewable in minutes. Examples:

- Initializing all fields in the same order in every construction site
- Declaring optional fields up front (as `null`) instead of adding them later
- Merging duplicate object-literal shapes into one constructor function
- Consistent `null` (never mixed with `undefined`) for empty fields
- Making an array's element kind consistent (fully packed, one type)

Per fix task:

1. Capture a before run: `--out bench/deopt/artifacts/<task>-before`
2. Apply the fix; run relevant unit/e2e tests for the touched module
3. After run: `--out bench/deopt/artifacts/<task>-after`
4. Verify the task's finding lines disappeared from `findings.txt` (and no
   new ones appeared); paste the diff into the PR description
5. One task per PR; open it as a draft and leave it in draft — the
   maintainer decides when it's ready for review
6. Update the task: status `fix-pr-opened`, link the PR, move cleared lines
   to `Resolved:`

**Non-trivial — report, don't fix.** Anything involving a data-structure
change (e.g. object→Map), semantic questions, cross-module refactors, or
perf tradeoffs that need judgment. Write into the task body:

- **Root cause**: what shapes diverge and why (with construction sites)
- **Evidence**: finding lines, map-transition observations
- **Options**: 2–3 approaches with tradeoffs (including "accept it")
- **Recommendation**: which option and why

Set status `needs-decision` and surface it to the maintainer. Do not open a
PR. When a decision comes back, record it in the task (`decision: ...`) and
either proceed (it's now effectively mechanical) or set `accepted` with the
rationale.

## Phase 5 — Update state and hand off

Before ending a session: make sure every task touched reflects reality
(status, notes, PR links), and commit the triage file update to the current
branch if the maintainer has asked for the work to be committed. The triage
file is the only handoff artifact — the next session must be able to resume
from it alone.

## Triage file template

```markdown
# Deopt triage: <scenario>

Tool: `pnpm bench:deopt --scenario <scenario>` (see bench/deopt/README.md)
Workflow: `$deopt-triage`

## Task: <short root-cause name>

- status: pending | investigating | fix-pr-opened <url> | needs-decision |
  accepted | fixed
- severity: high | info
- updated: <date> <what changed>

<Root-cause hypothesis, analysis, options, recommendation, decision — grows
as the task progresses.>

Findings:
```

high deopt-eager <module> <function> <detail>
...

```

Resolved:

```

(lines moved here when they stop appearing, with the PR/run that cleared
them)

```

```

## Statuses

| Status           | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `pending`        | Grouped, not yet investigated                             |
| `investigating`  | A session is (or was) analyzing it                        |
| `fix-pr-opened`  | Mechanical fix in a draft PR, awaiting review             |
| `needs-decision` | Analysis + recommendation written; maintainer must choose |
| `accepted`       | Deliberately not fixing; rationale recorded               |
| `fixed`          | Fix merged and verified gone in a post-merge run          |
