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

`LocalRecordingSpan` owns capture and completion for requests and tooling. `local-span-replay.node.ts` buffers and delivers tooling spans to the SDK, including completed worker records. Selected operations preserve explicit parent relationships. `scope: true` activates coarse local operations; `recordToInsights: true` selects Request Insights independently of external reporting. Compiler workers return completed records and selection metadata for coordinator replay without initializing another SDK.

The replay module buffers detached OTel data until registration, then drains it with original timestamps. Snapshots copy supported values without invoking JSON serializers. Later spans go directly to the SDK without buffering or admission. Worker batches resolve their IDs and parent order once when ingested. Metrics use the normal meter API independently of the tracer provider.

One snapshot queue also defers work created by SDK callbacks until the current callback returns. It holds at most 1,000 entries, with one slot reserved for the root. Full queues warn and drop external reporting without dropping local traces. Individual payload size is uncapped. Active numeric-parent lookup retains only bounded context tokens. SDK calls run synchronously, so application processors can block tooling work. Closing releases pending records without fabricating completion times for unfinished work.

## Tests

`test/e2e/app-dir/otel-tooling` covers configuration, sampling, HMR, worker replay, restarts and build failures. Its synchronous exporter verifies SDK delivery, not network delivery or batched-exporter draining. `test/unit/otel-tooling-replay.test.ts` covers replay limits, SDK callback failures/reentrancy and closing.
