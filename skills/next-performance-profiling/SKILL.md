---
name: next-performance-profiling
description: >
  Diagnose React performance problems in a running Next.js app by capturing and
  reading the React Performance Tracks and the React DevTools Suspense view. Use
  when an app feels slow and you need to find the cause (slow first paint, late
  or janky reveals, a server data waterfall, content gated behind one Suspense
  boundary, cascading renders, or an interaction that blocks the main thread)
  rather than guessing from the source.
---

# next-performance-profiling

Find a React performance problem by measuring it. React 19.2 emits Performance Tracks (Scheduler ⚛, Components ⚛, Server Components ⚛) into the browser's performance timeline, and React DevTools adds a Suspense view showing fallback to content reveals. This skill is the loop for capturing those signals and naming the fix. The worked numbers live in the companion guide and demo (see [references](#references)); this file is the method.

## requires

- React **19.2+** in development or a profiling build (the tracks are dev-only).
- A live browser session with React DevTools enabled, which is the [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) skill's job: it opens the browser, restores the session, enables React DevTools, and connects `/_next/mcp`. **Load and run `next-dev-loop` first.** This skill picks up once its preflight passes. Install it if your agent does not have it: `npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`.
- `agent-browser` **>= 0.31** for the `react` and `trace` subcommands. Read flags from the React and Performance sections of `agent-browser --help` (a per-subcommand `--help` only prints the global help). Every `react` command needs `--json`. Agents run headless; omit `--headed`.

Commands this skill drives: `vitals <url> --json` (first triage), `react suspense --json`, `react renders start` / `stop --json`, and `trace start` / `trace stop <path>` (equivalent to `profiler`; both carry the `blink.user_timing` category the tracks live in).

## reach for the right surface

Triage with `agent-browser vitals <url> --json`: TTFB, LCP, and INP tell you which row below applies, and a route can hit more than one. Then capture only the matching surface, not everything.

| symptom                                        | surface                                            | capture                                                  |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| slow to show anything; high TTFB               | Server Components ⚛                               | `trace`, read the I/O waterfall                          |
| content reveals late, all at once              | Suspense view + `$RC` stream                       | `react suspense`, stream timing                          |
| interaction double-renders / brief stale flash | Scheduler ⚛ `Cascading Update` + render profile   | `react renders … --json`, `trace`                        |
| interaction is laggy; poor INP                 | Scheduler ⚛ Blocking (long task) + render profile | `trace` (long `EventDispatch`), `react renders … --json` |

## the loop

Capture a baseline, read it, form one hypothesis, fix, then re-capture and compare the same number. A fix you cannot show in a before/after capture is not verified.

### server data waterfall → Server Components ⚛

`trace start` → `open <url>` (a fresh load, not `reload`) → `wait` past the slowest data → `trace stop <path>`. On the Server Components ⚛ track, server I/O awaits appear as spans on the Primary track. **The tell:** independent reads that staircase, each span starting where the previous ends. Compare against work that should depend on them: if downstream work starts later than `start_of_first + max(durations)`, something is serialized needlessly. **Fix:** `Promise.all` the independent reads; keep a read in sequence only if it needs the previous result.

### content gated by one Suspense boundary → Suspense view

`react suspense` classifies boundaries (`N boundaries: M dynamic holes`) and names the actionable one; a single dynamic gap over a whole section is the smell. Quantify the gating from the stream: fetch with `Accept-Encoding: identity` and log when each child's HTML arrives versus when the boundary's `$RC("B:n")` swap fires. One late `$RC` while children were ready earlier means the slowest child is holding the fast ones. (This stream probe uses `curl`/`fetch` deliberately: it measures the network, not the browser, so `next-dev-loop`'s "no curl" rule does not apply. If curl is unavailable, use the trace: a child's span duration equals the reveal delay it causes.) **Fix:** give each independently paced child its own `<Suspense>`. **Verify:** one `$RC` per child, staggered.

### slow interaction → Scheduler ⚛ + render profile

`react renders start` → do the interaction → `react renders stop --json`. Read the per-component table (`Insts | Re-renders | Self | Top change reason`). Two opposite-looking modes:

- **A. Cascading render.** A component re-renders more than once, and the extra render's reason is a state hook other than the one you touched. The Scheduler ⚛ track shows an `Update` followed by a `Cascading Update`. Cause: derived data mirrored into `useState` and synced with `useEffect`. **Fix:** compute during render; delete the state and effect.
- **B. Blocking / large render.** The touched component renders once (reason: the hook you touched), there is **no** `Cascading Update`, but a child re-renders in large counts with reason `parent`, and the interaction is a long `EventDispatch` on the main thread. A controlled input renders synchronously inside the event, so the Scheduler track is sparse and the long task is the reliable signal. **Fix:** `React.memo` the expensive children, `useDeferredValue` or `useTransition` the input, virtualize a large list. `useDeferredValue` without `memo` does nothing.

**The absence of a `Cascading Update` does not mean "no bug."** It tells mode A from mode B. Read the per-component counts and `parent` reasons, not only the Scheduler markers.

## reading a trace

React tracks are `blink.user_timing` events: an async begin (`ph:"b"`) and end (`ph:"e"`) paired by `id2.local`, where only the begin carries `args.detail` (a JSON string with `devtools.trackGroup`, `devtools.track`, `devtools.tooltipText`). Save the profile as JSON and pair them:

```js
const { traceEvents } = require('./trace.json')

// Keep only the begin/end user-timing events, in time order.
const timingEvents = traceEvents
  .filter((event) => /user_timing/.test(event.cat || ''))
  .filter((event) => event.ph === 'b' || event.ph === 'e')
  .sort((a, b) => a.ts - b.ts)

const openSpans = new Map()
const spans = []

for (const event of timingEvents) {
  const key = `${event.id2?.local}|${event.name}`

  // A "begin" opens a span; the matching "end" closes it.
  if (event.ph === 'b') {
    openSpans.set(key, event)
    continue
  }

  const begin = openSpans.get(key)
  if (!begin) continue
  openSpans.delete(key)

  const { trackGroup } = JSON.parse(begin.args.detail).devtools
  spans.push({
    name: begin.name,
    trackGroup,
    start: begin.ts,
    dur: (event.ts - begin.ts) / 1000, // duration in ms
  })
}
```

For a blocking interaction, also scan complete (`ph:"X"`) events named `EventDispatch` / `FunctionCall` by `dur`; that is the long task. Real traces are large, so parse the file once and query the arrays.

## gotchas

- `react <cmd>` without `--json` prints `✓ Done` and no data.
- The page can drift to `about:blank`. Check `get url`, and trace a fresh `open <url>`, not `reload`.
- Let HMR settle before a render capture (`wait` after `open`). A recompile injects phantom renders (reason `state: "compiling" -> "none"`, mount counts unrelated to your data). Absurd counts mean you captured a recompile.
- StrictMode doubles dev renders, so a list of N rows shows about 2N instances. Read counts relatively (before vs after), or use a profiling build.
- A `Promise.all` group is recorded on the track as only the read that gates it (the slowest to resolve); members that resolve earlier get no span at all, even on the Server Requests track. So after a parallel fix, expect fewer spans, not the same set overlapping. A missing span is not proof nothing ran. Never verify a parallel fix by counting spans; verify it by timing: the gating read now starts right after its prerequisite, and dependent work starts earlier.
- The `react renders stop` "recording Xs" header is wall-clock since `start`, not your interaction. Confirm the capture from the change-reason column.
- `[agent-browser] restore: missing` is expected on first run.

## when you get lost

An empty or malformed capture (no Server Components ⚛ track, an empty render profile, a trace of the wrong navigation) is almost always preflight: React DevTools not enabled at launch, a drifted page, or a keystroke that did not register. Re-run `next-dev-loop` preflight before touching app code. A capture that merely lacks a `Cascading Update` is not a failure; see mode B.

## references

- Companion guide (the human walkthrough of these steps): the Next.js [Profiling performance](/docs/app/guides/profiling-performance) guide.
