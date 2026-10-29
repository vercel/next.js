# Experimental OpenTelemetry tooling prototype

This is an opt-in architectural spike, **not a supported public API or default tracing migration**. Names, hooks, limits and packaging are provisional.

## Try it

Configure your application's OpenTelemetry provider/exporter in `instrumentation.ts` as usual, then run:

```sh
NEXT_EXPERIMENTAL_OTEL_TOOLING=1 next build
NEXT_EXPERIMENTAL_OTEL_TOOLING=1 NEXT_EXIT_TIMEOUT_MS=6000 next dev
```

There is no built-in external destination. The application owns the endpoint, exporter, resource, sampler, processors, context manager and propagators. Await provider initialization in `register()`; installing a provider later in fire-and-forget work does not recover spans already emitted to a no-op provider.

For cooperative flushing, optionally export `flushTraces()` from `instrumentation.ts`. This can call your own SDK's public `forceFlush()` method. Keep Node-only SDK imports behind `NEXT_RUNTIME === 'nodejs'`:

```ts
let flush: (() => void | Promise<void>) | undefined

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // An application-owned module that initializes the provider/exporter.
    const telemetry = await import('./telemetry.node')
    await telemetry.start()
    flush = () => telemetry.forceFlush()
  }
}

export function flushTraces() {
  return flush?.()
}
```

The hook is called after the tooling root has ended, completed tooling/worker records have been emitted, and the local trace writer has flushed. Next waits up to **5 seconds**, logs a nonfatal diagnostic on rejection/timeout, and never reaches into provider internals or shuts down the application's SDK. Without this hook, the SDK owns export completion; Next cannot guarantee a final remote drain.

**Dev shutdown:** the CLI normally gives its child only 100ms before SIGKILL. Set `NEXT_EXIT_TIMEOUT_MS` high enough for server cleanup and the cooperative hook (the command above allows 6 seconds). SIGKILL, crashes and forced restarts cannot guarantee remote completion. Production server shutdown/request tracing is unchanged by this prototype.

## Two independent lanes

- **Local:** the tooling Span records directly through the existing JSON reporters, independently of any application delegate. Like Request Insights' local recorder, it does not need a private provider. Legacy safe numeric IDs, monotonic microseconds, epoch-millisecond wall start and arbitrary raw tags remain independent of SDK attribute limits. This spike leaves Request Insights' request-specific recorder/context handling unchanged.
- **Application reporting:** tooling spans are explicitly paired/replayed using the application's global tracer (`next.js.tooling`) with explicit parent contexts. No active application context, provider, sampler, context manager or propagator is replaced. Application sampling and attribute limits apply to this lane only. Structured/array legacy tags are represented as JSON-valued strings for OTel; null/undefined tags are omitted there, not from local data.

`.next/dev/trace`, `.next/trace` and filtered `.next/trace-build` retain their existing newline-delimited array format, session ID, numeric IDs/parents, event names/tags, integer-microsecond durations and buffering/rotation semantics. Custom output directories are supported. The writer uses append mode in dev, but **ordinary dev startup cleanup still removes the prior session's trace**, as before. The legacy upload flag and custom upload wire format remain unchanged; they are not OTLP.

## Initialization and replay

Dev uses existing instrumentation compilation/registration. External tooling coverage starts in the dev-server child: startup, compilation/HMR and other child tooling operations. It intentionally does not export the CLI-parent `next-dev` session or invent a substitute parent.

An opted-in build registers the current build's compiled instrumentation entry in the **coordinator after compilation**, not via an early source loader. Ordinary builds continue skipping runtime registration. Compiler workers inherit the gate and return local tooling records through the existing coordinator path; they do not initialize the application SDK separately. The coordinator reconstructs each worker batch parent-first and suppresses redelivery. Arbitrary application-created prerender-worker spans and full Rust/native tracing are outside this spike; existing selected native compilation events remain included.

Early reporting records are retained until registration completes, with original start/end times. Live roots remain open; later children can join an ended startup parent. Storage is bounded by **10,000 records and 8 MiB** (UTF-8 names/normalized attributes plus per-record accounting). The same bounds apply to concurrently live reporting records. On overflow, external replay/new records or oversized attribute updates are dropped and a single diagnostic is emitted; local recording is unaffected. Completed reporting records release their attributes after registration, rather than accumulating every module span forever.

Direct parent handles preserve reporting context after end. Numeric-ID lookup uses live/queued spans and the pinned default startup parent. If an already-ended non-default numeric parent is no longer available, the reporting lane falls back to the known tooling root (or a root if none is available); `next.tooling.parent_id` retains the original numeric relation. Local parentage is unchanged. Reporting IDs are W3C IDs, not the legacy numeric/session IDs; `next.tooling.id` permits correlation.

Failures before successful compilation/registration still flush local traces once the output directory is known, but cannot report through an unavailable application provider. They do not load stale instrumentation output in the finalizer or when the current build has no instrumentation source entry, even with `cleanDistDir: false`. **Immediate process exits bypass finalizers:** in particular, the default `experimental.prerenderEarlyExit` policy exits the prerender worker and coordinator on a render error; use `prerenderEarlyExit: false` when evaluating controlled-failure flushing. Changing that existing exit policy is outside this spike. Hook failures, early replay overflow, missing hooks, abrupt termination and application sampling are explicit remote-reporting boundaries, not reasons to drop local diagnostics on the normal finalization path.

## Verification

The development suites `hmr-trace-timing`, `enabled-features-trace` and `rage-restart-trace` establish the legacy file contract first; the same assertions run with the gate enabled on Webpack and Turbopack. `test/e2e/app-dir/otel-tooling` exercises a custom HTTP exporter, custom dist directory, original timing/parentage, compiler-worker export, provider identity, AlwaysOff independence, registration count and flush ordering. Focused replay tests cover storage bounds, completed/live parents, worker ordering/redelivery and hook rejection/timeout. The existing writer/parser tests remain responsible for low-level buffered I/O and rotation edges.

This flag is for dev/build tooling, not an additional `next start` reporting mode. Production request tracing continues to use the existing instrumentation lifecycle; do not carry the prototype flag into a production deployment. Generalizing Request Insights and tooling recorders is separate work.

The framework adds no SDK provider or SDK dependency; it uses the OTel API to pair with the application's tracer, without requiring the application to use a particular SDK version. Dual recording adds allocation/normalization/export cost, particularly for per-module profiling. Full-scale performance review is required before considering a default rollout.
