# Experimental OpenTelemetry tooling prototype

Dev and build tooling reporting through the application's OpenTelemetry SDK. This prototype's API and coverage are provisional.

## Setup

Initialize your provider and exporter in `instrumentation.ts`. Dev uses the existing registration lifecycle automatically. To also call `register()` in the build coordinator, set:

```ts
import type { NextConfig } from 'next'

export default {
  experimental: { otelInBuild: true },
} satisfies NextConfig
```

The option defaults to `false` and only controls loading and invoking build-coordinator instrumentation. Enabled builds await `register()` after compilation, using the current build's compiled instrumentation. Span reporting, metrics and replay operate independently of this option. A provider installed outside `instrumentation.ts` can receive build telemetry with the option disabled; without a provider, SDK delivery is a no-op. Use `process.env.NEXT_PHASE` with `PHASE_PRODUCTION_BUILD` or `PHASE_DEVELOPMENT_SERVER` from `next/constants` to choose phase-specific exporters.

Await SDK initialization in `register()`. The application owns export configuration, sampling and delivery. Next does not flush or shut down the SDK; queued telemetry may be lost at process exit. Existing production request tracing is unchanged.

## Coverage

Selected spans cover build/compiler phases, static checks and generation, dev startup, compilation, HMR, rendering and browser hydration. Producers select external reporting with `reportToOtel: true`; names do not control selection. Per-module profiling, loader/plugin work and per-page static checks/renders remain local-only.

Memory samples become histograms; memory-threshold restarts also increment a counter. Turbopack persistence/compaction report spans and measurements. Metrics use finite operation/reason dimensions and remain independent of trace sampling.

Each dev-server child has a `dev-server-session` root that ends on normal shutdown or restart. Builds use `next-build`. Session metadata and `next.tooling.id` / `next.tooling.parent_id` correlate SDK spans with local traces.

Local trace files and Request Insights remain independent of build registration and application sampling. The legacy upload flag still uses its existing format.

## Capture and replay

`LocalRecordingSpan` owns capture and completion for requests and tooling. File delivery reads the captured timing and raw attributes directly. OTel attributes and Request Insights records are projected only for selected destinations; `request-insights-span-recorder.ts` owns activity identities, grouping and delivery. `local-span-replay.node.ts` queues tooling span starts and completions until the SDK is registered. Selected operations preserve explicit parent relationships. `scope: true` activates coarse local operations; `recordToInsights: true` selects Request Insights independently of external reporting. Compiler workers return completed records and selection metadata for coordinator replay without initializing another SDK.

Registration drains one bounded queue through the normal tracer API with the original timestamps. Later starts and completions use the same queue and drain immediately. Worker batches resolve their selected parent order when ingested. Metrics use the normal meter API independently of the tracer provider.

Parent span objects retain lightweight context handles after completion. Calling `Span.getId()` also retains that context for numeric parent lookup until the session closes. Worker contexts stay within their replay batch. Completed non-root payloads and SDK spans are released independently.

The queue guard defers work created by synchronous SDK callbacks until the current item returns. It holds at most 1,000 spans before registration, with one slot reserved for the root. Full queues warn and drop external reporting without dropping local traces. Closing drops pending records without fabricating completion times for unfinished work.

## Tests

`test/e2e/app-dir/otel-tooling` covers configuration, sampling, HMR, worker replay, restarts and build failures. Its synchronous exporter verifies SDK delivery, not network delivery or batched-exporter draining. `test/unit/otel-tooling-replay.test.ts` covers queue draining, replay limits, worker parentage, SDK failures and reentrancy.
