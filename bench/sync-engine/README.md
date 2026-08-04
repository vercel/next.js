# sync-engine benchmark

A reproducible A/B benchmark for the synchronous turbo-tasks engine (`--features sync`) against the async one, on a real production `next build` of a generated Next.js app.

This provides a repeatable, shareable way to measure whether the sync engine matches or exceeds the async engine. Reproducing performance only on a private app is not sufficient.

## Quick start

```bash
node bench/sync-engine/run.js --preset medium --runs 3 --build
```

That will:

1. generate `bench/sync-engine/generated/medium/` (deterministic, gitignored),
2. build both binaries into separate cargo target dirs,
3. generate `project_options.json` for the app,
4. run each engine N times and print wall time, average cores busy, and the ratio.

Subsequent runs can drop `--build`.

## The app

`generate.js` emits a deterministic synthetic App Router app from a seeded PRNG. The shape is picked to exercise the parts of the engine that the two modes schedule differently:

| ingredient                  | what it exercises                                     |
| --------------------------- | ----------------------------------------------------- |
| wide shared component library | wide `parallel!` fan-out inside a single task body    |
| deep import chains          | genuinely serial dependency chains (the critical path) |
| many independent routes     | top-level, cross-endpoint parallelism                  |
| `'use client'` modules      | two module graphs per route (server + client)          |
| CSS modules                 | a second asset pipeline                                |

Presets: `small` (~200 modules, for fast iteration), `medium` (~1000), `large` (~4000, closest to a real product app).

## Reading the output

```
  async/sequential     median   12.10s  min   11.84s  1.00x  cores=4.71
  async/concurrent     median    7.42s  min    7.31s  0.61x  cores=8.02
  sync/sequential      median   35.90s  min   35.11s  2.97x  cores=1.28
```

`cores` is `(user+sys CPU) / wall` — the average number of cores kept busy. It is the number that matters: if sync's wall time is 3x async's and its `cores` is ~1 while async's is ~5, the gap is **scheduling** (sync isn't using the machine), not per-task overhead. If `cores` matched but wall time didn't, the gap would be per-task overhead instead.

Compare `async/sequential` for an apples-to-apples engine comparison (both drivers build routes one at a time); `async/concurrent` is what a real `next build` does and is the number an end user would feel.

## Flags

- `--preset small|medium|large`
- `--runs N` (median reported)
- `--limit N` — cap the number of routes built
- `--only sync|async`
- `--strategies sequential,concurrent`
- `--env KEY=VAL` — repeatable; forwarded to the build process (for `TURBO_SYNC_*` knobs)
- `--json out.json`
- `--build` — force `cargo build` first

## Useful environment knobs

| var                                 | effect                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| `TURBO_TASKS_AVAILABLE_PARALLELISM` | worker count for both engines                            |
| `TURBO_SYNC_SEQUENTIAL=1`           | sync: force the fully-serial fallback (A/B oracle)       |
| `TURBO_SYNC_STATS=1`                | sync: print scheduler counters + a parallelism histogram |
