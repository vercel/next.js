# Experimental OpenTelemetry tooling prototype

This is an opt-in architectural spike, **not a supported public API or default tracing migration**. Names, hooks, limits and packaging are provisional.

## Try it

Configure your application's OpenTelemetry provider/exporter in `instrumentation.ts` as usual, then run:

```sh
NEXT_EXPERIMENTAL_OTEL_TOOLING=1 next build
NEXT_EXPERIMENTAL_OTEL_TOOLING=1 NEXT_EXIT_TIMEOUT_MS=11000 next dev
```

There is no built-in external destination. The application owns the endpoint, exporter, resource, sampler, processors, context manager and propagators. Await provider initialization in `register()`; installing a provider later in fire-and-forget work does not recover spans already emitted to a no-op provider.

For cooperative flushing, optionally export `flushTraces()` from `instrumentation.ts`. This can call your own SDK's public `forceFlush()` method. Keep Node-only SDK imports behind `NEXT_RUNTIME === 'nodejs'`:

```ts
let flush: (() => void | Promise<void>) | undefined

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Your application-owned telemetry-node.ts module initializes the SDK.
    const telemetry = await import('./telemetry-node')
    await telemetry.start()
    flush = () => telemetry.forceFlush()
  }
}

export function flushTraces() {
  return flush?.()
}
```

Finalization ends the local tooling root and flushes local files first, then closes reporting intake and invokes the optional application hook with a **5-second cooperative allowance**. There is no private SDK-creation queue to drain. Hook rejection/timeout is nonfatal; Next never reaches into provider internals or shuts down the application's SDK. The hook still runs after reporting loss. Without it, the SDK owns export completion; Next cannot guarantee a final remote drain.

Selected SDK creation/completion runs synchronously after registration. Application samplers/processors can block these calls; there is no yielding or reporting deadline. The hook timeout is cooperative too: it cannot interrupt synchronous application work. Closing never invents ends for genuinely unfinished local operations.

**Dev shutdown:** the CLI normally gives its child only 100ms before SIGKILL. Set `NEXT_EXIT_TIMEOUT_MS` high enough for server cleanup and the cooperative hook (the command above allows 11 seconds). SIGKILL, process failures and forced restarts cannot guarantee remote completion. Production server shutdown/request tracing is unchanged by this prototype.

## One recorder, distinct tracing APIs

`server/lib/trace/local-span-recorder.ts` provides the existing `LocalRecordingSpan`, `createLocalSpan` and `traceLocalSpan` APIs for local capture, attributes and end-once completion. There is no tooling `Span` facade, consumer-category options bag or shared superclass. Creation accepts one `parent?: Span | SpanId | null`: a live span supplies available ancestry, a numeric ID (including zero) carries correlation only, and null explicitly detaches from the default file parent. Omitting the parent preserves the file coordinator/worker default; it never implicitly adopts an active request span.

`startTime` keeps its public OTel timestamp meaning. For direct file delivery, `monotonicStartTime` accepts lossless `process.hrtime.bigint()` values, and `wallStartTimeMs` independently supplies the epoch-millisecond file start. Request boundary options retain public timestamps and scalar OTel attributes; they do not advertise these file-only clocks. With an explicit public timestamp, the file path maps it to the monotonic clock without interpreting its type as a destination selector.

Generic creation accepts an optional completed-record delivery callback as its second argument; omitted delivery uses the direct file reporters. It never captures request identity or sinks. `request-span-recorder.ts` binds those at creation for the existing tracer registry and request/validation callbacks. That boundary owns inherited request-parent resolution and local callback scope; generic callback tracing stays explicit-parent and scope-free. The recorder's existing SDK delegate and context operations are unchanged. Completed worker/browser observations use `recordSpans`; selected client HMR observations pass through the shared completion path. This is internal plumbing, not an application subscription API.

- **Fine-grained tooling is local-only, except selected client HMR latency:** per-module Webpack/Rspack profiling, loader/plugin/Babel passes, per-page static checks/renders, memory samples and other native/browser observations use the local recorder APIs. Even with an application provider and the prototype enabled, these calls do not create SDK delegates, external descriptors or snapshots, or invoke application samplers/processors. Explicit tooling parents do not establish request scope or adopt application context. Fine-only imports do not eagerly load the runtime OTel API.
- **Selected coarse tooling uses the existing Next tracer API:** `getTracer().trace` / `startSpan` at the producer select build/compiler phases, batch checks/generation, dev startup and compilation cycles. Callback setup begins at the original creation point and uses the callback span as the explicit parent. Normal boundaries are retained; a real setup exception now completes through Next's error path instead of leaving the old pre-created callback span unfinished. There is no destination flag or automatic promotion of descendants. The finite internal `ToolingSpan` constants list the selected operations. The prototype gate controls their additional application reporting, not `NEXT_OTEL_VERBOSE`.
- **Selected client observation:** `client-hmr-latency` additionally reports through the application provider when the prototype gate is enabled. Both bundlers retain the original browser start/end times and `page`, `updatedModules` and `isPageHidden` tags locally. This already-completed observation supplies final attributes at SDK start and uses the available selected tooling-parent context, including after parent completion; it passes through the local recorder completion path without selecting other browser observations.
- **Local files:** default local delivery passes both fine and coarse completions to the existing JSON/build/telemetry reporters. It does not consume SDK spans or depend on Request Insights, application registration or sampling. Legacy safe numeric IDs, monotonic microseconds and epoch-millisecond wall starts are retained independently of the request schema and SDK limits. Existing buffered file I/O is synchronous, not a promise of non-blocking recording.
- **Request Insights:** selected coarse tooling and client HMR latency also use the dev-only local request recorder, independently of the prototype OTel gate and application sampling. Request-triggered compilation captures the originating request identity at span creation. Startup and background work appear as separate tooling activities, visible in live views and persisted history; the activity root supplies its completion boundary. Completed startup parents do not absorb later background work. Scoped worker/validation collectors retain creation-time ownership. Fine-grained tooling remains file-only, and spans created directly through the application OTel API are not ingested. Local-only request observations do not gain application SDK delegates. Provider ownership and production tracing are unchanged.
- **Application reporting:** selected capture/replay shares the existing Next tracer's application-owned `next.js` backend. Before awaited registration it retains bounded records; registration replays them synchronously, then selected coordinator starts/ends and completed worker/client observations report inline. It connects selected coarse ancestors without reconstructing omitted fine ancestors, preserving the original local numeric parent in correlation attributes. Selected boundaries pay normal SDK costs, including application sampling/processors; they are not zero-SDK-work or nonblocking APIs. Application exporter batching is independent of this adapter. No application provider, context manager or propagator is replaced.

Tooling attributes are normalized at the module boundary for **both** saved/local tags and external reporting: supported scalar values/arrays are retained, structured objects and mixed/nested arrays become JSON strings, and top-level null/undefined values are omitted. Unserializable values (including bigint/cyclic payloads) are omitted nonfatally. The SDK adapter additionally JSON-encodes non-scalar tag values, including supported local arrays; scalar values keep their types. Keys are preserved, not flattened. Later mutations and imported observations use the same policy, without a second mutable raw-tag bag. Tooling saved events retain their normalized tags for late writes; ended request spans release heavy references and ignore mutations.

`.next/dev/trace`, `.next/trace` and filtered `.next/trace-build` retain their existing newline-delimited array format, session ID, numeric IDs/parents, event names/tag keys, integer-microsecond durations and buffering/rotation semantics. Custom output directories are supported. The writer uses append mode in dev, but **ordinary dev startup cleanup still removes the prior session's trace**, as before. The legacy upload flag and custom upload wire format are unchanged; they are not OTLP.

## Initialization and replay

Dev uses existing instrumentation compilation/registration. External tooling coverage starts in the dev-server child: selected startup and compilation/HMR operations. It intentionally does not export the CLI-parent `next-dev` session or invent a substitute parent.

An opted-in build registers the current build's compiled instrumentation entry in the **coordinator after compilation**, not via an early source loader. Ordinary builds continue skipping runtime registration. Compiler workers inherit the gate and return completed local DTOs plus internal coarse-selection/nearest-parent metadata; they do not initialize a separate application SDK. The coordinator imports each finished worker result once and replays selected spans parent-first; it does not deduplicate repeated imports by numeric ID. Parallel compiler workers can allocate overlapping legacy numeric IDs, as they did before this prototype. Worker batches share retention limits but do not replace live coordinator records used for parent lookup. Unmarked worker and other native/browser observations stay local-only. Selection metadata is not added to legacy file fields/tags. Arbitrary application-created prerender-worker spans and full Rust/native tracing are outside this spike.

Early coarse reporting records are retained until awaited registration completes, with original start/end times, then replayed before enablement returns. Later selected coordinator spans start inline and end at their actual completion; completed worker batches replay inline on arrival, not at overall build completion. SDK callbacks execute at processing time, not historical event time. Completed buffered/imported records supply final tags to the application's sampler at SDK start. Still-live spans start with **name/numeric correlation only**, then receive final tags at completion; their sampling decision is not revisited. Buffering preserves observations, not the original sampler/processor execution time, and does not eliminate SDK allocation or processing costs.

Central retention is bounded by **10,000 descriptors and 8 MiB** of accounted metadata/snapshot strings, including pre-registration and live work: 256 bytes per descriptor plus twice the name/snapshot string lengths (UTF-16 accounting). One slot and 512 bytes are reserved for explicitly captured coordinator-root metadata. These are not exact process/transient heap limits; local recording and SDK memory are independent. Admission overflow drops new external starts and warns once, without affecting local traces. Admitted descriptors always capture end/status even if their snapshot is oversized or cannot encode: reporting emits them metadata-only, or ends their already-started SDK span using the real local end.

Completed descriptors release their name, snapshot, SDK object and ancestor references. Only a small identity/context token can survive through a caller-retained local recorder/direct parent handle; these caller-owned tokens are outside the central backlog accounting. The backend keeps no global history of ended tokens.

Direct parent handles preserve reporting context after end. Numeric-ID lookup uses retained selected spans and the pinned default startup parent. If an already-ended non-default numeric parent is no longer available, the reporting lane falls back to the known tooling root; `next.tooling.parent_id` retains the original numeric relation. Worker batches resolve admitted selected parents before any SDK calls; if a parent cannot be admitted, use the real coordinator root. A batch with no known coordinator root is dropped nonfatally, not given an invented root. Full local parentage is unchanged. Reporting IDs are W3C IDs, not the legacy numeric/session IDs; `next.tooling.id` permits correlation.

Only completed operations are written locally and exported by the application SDK. Some existing Webpack invalidation operations can stay unfinished even at shutdown: their children may reference a parent still open in the SDK and absent from both completed exports and the local file. Flushing does not invent an end time for those parents; fixing their underlying lifecycle is separate work.

Failures before successful compilation/registration still flush local traces once the output directory is known, but cannot report through an unavailable application provider. They do not load stale instrumentation output in the finalizer or when the current build has no instrumentation source entry, even with `cleanDistDir: false`. **Immediate process exits bypass finalizers:** in particular, the default `experimental.prerenderEarlyExit` policy exits the prerender worker and coordinator on a render error; use `prerenderEarlyExit: false` when evaluating controlled-failure flushing. Changing that existing exit policy is outside this spike. Hook failures, early replay overflow, missing hooks, abrupt termination and application sampling are explicit remote-reporting boundaries, not reasons to drop local diagnostics on the normal finalization path.

## Verification

The development suites `hmr-trace-timing`, `enabled-features-trace` and `rage-restart-trace` establish the legacy file contract first, with the gate on/off on Webpack and Turbopack. `test/e2e/app-dir/otel-tooling` exercises a custom HTTP exporter, default and custom dev output directories, a custom build dist directory, selected hierarchy/timing, compiler-worker export, provider identity, AlwaysOff independence, registration count and flush ordering. Both it and `hmr-trace-timing` perform a real browser edit on both bundlers and require same-document HMR, the default `.next/dev/trace` client event, its original duration/tags and local parent. The tooling suite correlates that event to its application export when enabled and sampled, and requires local capture with the gate off or AlwaysOff sampling; the legacy suite needs no application provider. Parentage checks require either a completed export or matching live-span identity observed by the application's public processor; missing completed parents still fail.

The development suite `request-insights-tooling` separately checks startup, request compilation, persisted history and client HMR with the prototype gate disabled and no application provider, using default and custom output directories.

The e2e suites are the primary tooling coverage, including gate/sampler variants, registration and flush ordering, worker ancestry, and build failures before and after registration. A small unit suite retains deterministic checks for count/byte buffer limits, reentrant or throwing application SDK callbacks, the cooperative flush-hook timeout, and out-of-order worker imports that overlap coordinator IDs. Existing recorder/request tests and writer/parser tests retain responsibility for their original contracts, including buffered I/O and rotation; the tooling suite does not exhaustively test every internal replay or lifecycle combination.

This flag is for dev/build tooling, not an additional `next start` reporting mode. Production request tracing continues to use the existing instrumentation lifecycle; do not carry the prototype flag into a production deployment.

The framework adds no SDK provider or SDK dependency. Fine-only work avoids SDK and external snapshot costs, but attribute normalization, local recording and file I/O still cost work. Selected snapshots, scope management, SDK allocation and export also have costs. Performance comparisons must separate recorder/API overhead from the intentionally reduced external coverage; no speedup or no-overhead claim follows merely from exporting fewer spans. Full-scale performance review is required before considering a default rollout.
