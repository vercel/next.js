# `<html>` class stripped after hydration in `next dev` — root cause

## Symptom

An inline `<script>` in the root layout `<head>` that seeds a class/attribute
onto `document.documentElement` before React hydrates (the classic
"no flash of incorrect theme" pattern) has that class/attribute **stripped by
React shortly after hydration** — but only in `next dev`. Production is
unaffected. It works in 16.2.11 and regressed in the 16.3 line.

Reported as: "Next.js 16.3.0-preview.9 removes a localStorage-seeded `<html>`
class after hydration … same code works on 16.2.11. Root-layout reconciliation
issue?"

## Verdict

**Real, confirmed dev-only regression — not a non-issue.** It is not a bug in
Next.js application/reconciliation code; it comes from the **vendored React
reconciler** and only manifests because the App Router enables React
StrictMode by default in dev.

## How it was pinned down

- Reproduced with a MutationObserver: attributes are added by the script, then
  reset to empty by a React commit on the **same** `<html>` node after
  hydration (`["dark|1","|null"]`).
- Matrix (published packages):

  | Version          | prod | dev          |
  | ---------------- | ---- | ------------ |
  | 16.2.11          | ok   | ok           |
  | 16.3.0-preview.9 | ok   | **stripped** |

- Bisected published canaries: **canary.2 = good, canary.3 = bad.**
- The only client/React change in that range that affects a plain app is the
  vendored React upgrade **#92945**
  (`19.3.0-canary-fef12a01-20260413` → `da9325b5-20260417`).
- Crossover experiment (holding Next.js code constant, swapping only the
  vendored React bundle) confirmed causation:
  - canary.3 Next + canary.2 React → **good**
  - canary.2 Next + canary.3 React → **bad**

## Mechanism (exact call path)

```
flushPassiveEffects
  → commitDoubleInvokeEffectsInDEV          (React StrictMode dev-only)
    → doubleInvokeEffectsOnFiber            (simulated unmount → remount)
      → disappearLayoutEffects → releaseSingletonInstance(<html>)   // strips attrs
      → reappearLayoutEffects  → commitHostSingletonAcquisition
                               → acquireSingletonInstance("html")   // strips attrs, re-applies only React's props
```

- `<html>`/`<head>`/`<body>` are React **HostSingletons**. Acquiring/releasing
  one removes every attribute on the live DOM node and re-applies only the
  props in React's vdom. The root layout renders no `className` on `<html>`, so
  the script-seeded class/attribute is wiped.
- The App Router wraps the app in `<React.StrictMode>` by default in dev
  (`__NEXT_STRICT_MODE_APP` defaults to `true`; see
  `packages/next/src/build/define-env.ts`). StrictMode's dev "double-invoke
  effects" simulates unmount+remount on initial mount; the upgraded React now
  reaches the **root** `<html>` singleton during that simulation.
- Both React versions contain the singleton release/acquire code; the upgrade
  changed the fiber-flag gating (added bit `2^27`) so the double-invoke now
  traverses down to the root singleton on initial mount, which it did not
  before. Production never runs double-invoke, so it is unaffected.

## Fix

The correct fix is **upstream in React**: host-singleton release/acquire should
be a no-op during StrictMode's dev double-invoke (the node never actually left
the document, so its live attributes must be preserved). This was validated
locally by guarding `releaseSingletonInstance` and `acquireSingletonInstance`
to skip the destructive attribute strip while the double-invoke is active —
with StrictMode on, the seeded class then survives.

Because Next.js only vendors React's compiled output (synced via
`pnpm sync-react`), there is no correct Next.js application-code fix; the change
must land in React and be pulled in via a React sync. Do **not** disable the
default StrictMode or hand-edit the vendored bundle as a "fix".

## Workaround (users, dev only)

Set `reactStrictMode: false` in `next.config.js` — verified to stop the strip.
Production is not affected regardless.

## About this test

`html-class-hydration.test.ts` asserts the **correct** behavior (the seeded
class survives hydration). It therefore **fails on current HEAD** (it reproduces
the bug) and will pass once the upstream React fix is vendored — or today with
`reactStrictMode: false`.
