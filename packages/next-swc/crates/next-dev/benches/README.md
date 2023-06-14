<!--
    IMPORTANT: This document is linked to from https://turbo.build
    DO NOT rename this file without updating the link in docs/pages/pack/docs/benchmarks.mdx
-->

# Benchmarking Turbopack

The simplest way to run Turbopack's benchmark suite is with the command `cargo bench -p next-dev`. This will benchmark Turbopack's Next.js development server in a variety of scenarios and it's what we use to track Turbopack's performance over time.

`cargo bench -p next-dev` accepts different options via environment variables. To vary the number of modules tested, set `TURBOPACK_BENCH_COUNTS`. For example, to test against an app with 5,000 modules instead of the default 1,000, run

```sh
TURBOPACK_BENCH_COUNTS=5000 cargo bench -p next-dev
```

## Benchmarking Turbopack against other bundlers

The benchmark numbers we share on [the Turbopack website](https://turbo.build/pack) are informed by running Turbopack's benchmark suite against Turbopack and other bundlers. These are run in a controlled environment prior to being published. We use the `bench_startup` and `bench_hmr_to_eval` benchmarks currently (see below).

To run Turbopack benchmarks against other bundlers, run:

```sh
cargo bench -p turbopack-bench -p turbopack-cli
```

and optionally filter the benchmarks run to specific bundlers, such as:

```sh
cargo bench -p turbopack-bench -p turbopack-cli -- "hmr_to_eval/(Turbopack CSR|Vite)"
```

**Note**: The Turbopack benchmark suite includes a mix of server-side rendered and client-only rendered examples -- these are reflected in "CSR" or "SSR" in the benchmark name. Turbopack supports both, while some other bundlers only support client-rendered examples. Take that into account when comparing CSR results against SSR.

**Hint**: These benchmarks take a long time to complete, since they try to capture at least 10 samples for every scenario. There is a `TURBOPACK_BENCH_PROGRESS=1` env var to show values while the benchmarks are running.

## Benchmark Suite scenarios

The benchmark suite runs Turbopack and other bundlers in a variety of scenarios. The tests use a real headless browser and perform a variety of common scenarios in web development, and wait for results to be reflected in the page.

- **bench_startup:** Time from startup (without cache) until the app is rendered in the browser (it doesn't have to be interactive/hydrated for this.)
- **bench_hydration:** Time from startup (without cache) until the app is interactive in the browser (it needs to be hydrated for that.) This metric is not captured for CSR since the first render is interactive.
- **bench_hmr_to_eval:** Time from changing a file until the new code is evaluated in the browser. Evaluating the code does not mean the change is visible to the user yet. For instance, when a React component changes, it needs to be re-rendered in the browser. This mostly measures the time spent computing the update in the bundler itself and sending it to the client.
- **bench_hmr_to_commit:** Time from changing a file until the change is reflected in the browser. We are using a `useEffect` hook within a React component to measure the time it takes for the updated React component to be committed to the DOM. This is a good measure of the end to end performance perceived by the user.
- **bench_startup_cache:** Time from startup with persistent cache until the app is rendered in the browser (it doesn't have to be interactive/hydrated for this.). Turbopack doesn't include a persistent cache yet. (This benchmark is disabled by default and can be enabled with `TURBOPACK_BENCH_CACHED=1`)
- **bench_hydration:** Time from startup with persistent cache until the app is interactive in the browser (it needs to be hydrated for that.) This metric is not captured for CSR since the first render is interactive. Turbopack doesn't include a persistent cache yet. (This benchmark is disabled by default and can be enabled with `TURBOPACK_BENCH_CACHED=1`)
