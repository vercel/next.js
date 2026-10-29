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

Finalization ends the local tooling root and flushes local files first, then gives the deferred consumer up to **5 seconds** to process reporting work. After the consumer is quiescent/closed, the optional hook gets a **separate 5-second allowance**. Hook rejection/timeout is nonfatal; Next never reaches into provider internals or shuts down the application's SDK. The hook still runs after reporting loss or drain timeout. Without it, the SDK owns export completion; Next cannot guarantee a final remote drain.

These are cooperative deadlines checked between SDK operations: a synchronous application sampler/processor can overrun them. At the drain deadline, remaining external work is discarded; even an admitted terminal notification may be lost then, leaving an SDK span unfinished. No later scheduled callback reopens the session, and flushing never invents ends for genuinely unfinished local operations.

**Dev shutdown:** the CLI normally gives its child only 100ms before SIGKILL. Set `NEXT_EXIT_TIMEOUT_MS` high enough for server cleanup, the deferred drain and the cooperative hook (the command above allows 11 seconds). SIGKILL, crashes and forced restarts cannot guarantee remote completion. Production server shutdown/request tracing is unchanged by this prototype.

## Two independent lanes

- **Local:** the tooling Span records directly through the existing JSON reporters, independently of any application delegate. Like Request Insights' local recorder, it does not need a private provider. Legacy safe numeric IDs, monotonic microseconds, epoch-millisecond wall start and arbitrary raw tags remain independent of SDK attribute limits. This spike leaves Request Insights' request-specific recorder/context handling unchanged.
- **Application reporting:** the producer captures lightweight start metadata and one immutable JSON snapshot at completion, without calling the OTel API/SDK or mirroring attribute mutations. A single deferred consumer lazy-loads the API and uses the application's global tracer (`next.js.tooling`) with explicit ROOT-based parent contexts. It processes up to 64 records or 4 ms per turn, then yields; this is not guaranteed CPU-idle execution. No active application context, provider, sampler, context manager or propagator is replaced. Application sampling and attribute limits apply to this lane only. Structured/array legacy tags are represented as JSON-valued strings for OTel; null/undefined tags are omitted there, not from local data.

`.next/dev/trace`, `.next/trace` and filtered `.next/trace-build` retain their existing newline-delimited array format, session ID, numeric IDs/parents, event names/tags, integer-microsecond durations and buffering/rotation semantics. Custom output directories are supported. The writer uses append mode in dev, but **ordinary dev startup cleanup still removes the prior session's trace**, as before. The legacy upload flag and custom upload wire format remain unchanged; they are not OTLP.

## Initialization and replay

Dev uses existing instrumentation compilation/registration. External tooling coverage starts in the dev-server child: startup, compilation/HMR and other child tooling operations. It intentionally does not export the CLI-parent `next-dev` session or invent a substitute parent.

An opted-in build registers the current build's compiled instrumentation entry in the **coordinator after compilation**, not via an early source loader. Ordinary builds continue skipping runtime registration. Compiler workers inherit the gate and return local tooling records through the existing coordinator path; they do not initialize the application SDK separately. The coordinator reconstructs each worker batch parent-first and suppresses redelivery. Arbitrary application-created prerender-worker spans and full Rust/native tracing are outside this spike; existing selected native compilation events remain included.

Early reporting records are retained until awaited registration completes, with original start/end times. Reporting makes progress before the build root ends. Completed records supply final tags to the application's sampler at SDK start. Still-live ancestors start with **name/numeric correlation only**, then receive final tags at completion; their sampling decision is not revisited. This intentionally changes callback timing and initial attributes compared with eager pairing.

Central retention is bounded by **10,000 descriptors and 8 MiB** of accounted metadata/snapshot strings, including live and queued work: 256 bytes per descriptor plus twice the name/snapshot string lengths (UTF-16 accounting). One slot and 512 bytes are reserved for explicitly captured coordinator-root metadata. These are not exact process/transient heap limits; local recording and SDK memory are independent. Admission overflow drops new external starts and warns once, without affecting local traces. Admitted descriptors always capture end/status even if their snapshot is oversized or cannot encode: the consumer emits them metadata-only, or ends their already-started SDK span using the real local end. Final-drain timeout remains a separate terminal-loss boundary.

Completed descriptors release their name, snapshot, SDK object and ancestor references. Only a small identity/context token can survive through a caller-retained local Span/direct parent handle; these caller-owned tokens are outside the central backlog accounting. The backend keeps no global history of ended tokens.

Direct parent handles preserve reporting context after end. Numeric-ID lookup uses live/queued spans and the pinned default startup parent. If an already-ended non-default numeric parent is no longer available, the reporting lane falls back to the known tooling root; `next.tooling.parent_id` retains the original numeric relation. Worker batches resolve admitted parents before deferred SDK work; if a parent cannot be admitted, use the real coordinator root. A batch with no known coordinator root is dropped nonfatally, not given an invented root. Local parentage is unchanged. Reporting IDs are W3C IDs, not the legacy numeric/session IDs; `next.tooling.id` permits correlation.

Only completed operations are written locally and exported by the application SDK. Some existing Webpack invalidation operations can remain unfinished even at shutdown: their children may reference a parent still open in the SDK and absent from both completed exports and the local file. Flushing does not invent an end time for those parents; fixing their underlying lifecycle is separate work.

Failures before successful compilation/registration still flush local traces once the output directory is known, but cannot report through an unavailable application provider. They do not load stale instrumentation output in the finalizer or when the current build has no instrumentation source entry, even with `cleanDistDir: false`. **Immediate process exits bypass finalizers:** in particular, the default `experimental.prerenderEarlyExit` policy exits the prerender worker and coordinator on a render error; use `prerenderEarlyExit: false` when evaluating controlled-failure flushing. Changing that existing exit policy is outside this spike. Hook failures, early replay overflow, missing hooks, abrupt termination and application sampling are explicit remote-reporting boundaries, not reasons to drop local diagnostics on the normal finalization path.

## Verification

The development suites `hmr-trace-timing`, `enabled-features-trace` and `rage-restart-trace` establish the legacy file contract first; the same assertions run with the gate enabled on Webpack and Turbopack. `test/e2e/app-dir/otel-tooling` exercises a custom HTTP exporter, custom dist directory, original timing/parentage, compiler-worker export, provider identity, AlwaysOff independence, registration count and flush ordering. Parentage checks require either a completed export or matching live-span identity observed by the application's public processor; missing completed parents still fail. Focused replay tests prove zero inline SDK work, deferred sampler inputs, immutable payloads and metadata-only completion after payload loss, reserved-root storage bounds, direct late parents, worker ordering/redelivery/suppression, deep iterative traversal, one yielding consumer, session generations and separate final-drain/hook budgets. The existing writer/parser tests remain responsible for low-level buffered I/O and rotation edges.

This flag is for dev/build tooling, not an additional `next start` reporting mode. Production request tracing continues to use the existing instrumentation lifecycle; do not carry the prototype flag into a production deployment. Generalizing Request Insights and tooling recorders is separate work.

The framework adds no SDK provider or SDK dependency; it uses the OTel API only in the deferred consumer, without requiring a particular application SDK version. Start/attribute producer paths avoid SDK/normalization work, but the extra JSON snapshot at completion is real producer cost. Deferred SDK work, allocation and export costs still exist, particularly for per-module profiling. Full-scale performance review is required before considering a default rollout.
