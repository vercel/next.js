# Tracing Turbopack

`turbo-tasks` comes with a tracing feature that allows to keep track of executions and their runtime and memory consumption. This is useful to debug and optimize the performance of Turbopack.

## Logging

Inside of Next.js one can enable tracing with the `NEXT_TURBOPACK_TRACING` environment variable.

It supports [the following special preset values][presets]:

- **`1` or `overview`:** Basic user level tracing is enabled. (This is the only preset available in a published Next.js release)
- **`next`:** Same as `overview`, but with lower-level `debug` and `trace` logs for Next.js's own crates
- **`turbopack`:** Same as `next`, but with lower-level `debug` and `trace` logs for Turbopack's own crates
- **`turbo-tasks`:** Same as `turbopack`, but also with verbose tracing of every Turbo-Engine function execution.

Alternatively, any directives syntax supported by [`tracing_subscriber::filter::EnvFilter`][directives] can be used.

> [!WARNING]
> A normal Next.js canary/stable release only includes the info level tracing. This is the tracing level intended for user-facing tracing.
>
> For the more detailed tracing a custom Next.js build is required. See [Developing] for more information how to create one.

With this environment variable, Next.js will write a `.next-profiles/trace-turbopack` file with the tracing information in a binary format.

[presets]: https://github.com/vercel/next.js/blob/c506c0de1d6f17ad400ad5aa85edaae23b6b44d2/packages/next-swc/crates/napi/src/next_api/project.rs#L218
[directives]: https://tracing.rs/tracing_subscriber/filter/struct.envfilter#directives
[Developing]: ../core/developing.md

## Viewer

To visualize the content of `.next-profiles/trace-turbopack`, use the [turbo-trace-viewer].

A video showing how to use the tool [is available here][youtube-tutorial].

This tool connects a WebSocket on port 57475 on localhost to connect to the trace-server. You can start the trace-server with the following command:

```sh
cargo run --bin turbo-trace-server --release -- /path/to/your/trace-turbopack

# or
pnpm next internal trace .next-profiles/trace-turbopack
```

Once the server is started, open <https://trace.nextjs.org/> in your browser.

> [!TIP]
> Make sure you're using a `--release` build when running the trace server. The trace server is very slow and this can make a very significant (10x) difference in performance.

The trace viewer allows to switch between multiple different visualization modes:

- **Aggregated spans:** Spans with the same name in the same parent are grouped together.
- **Individual spans:** Every span is shown individually.
- **... in order:** Spans are shown in the order they occur.
- **... by value:** Spans are sorted and spans with the largest value are shown first.
- **Bottom-up view:** Instead of showing the total value, the self value is shown.

And there different value modes:

- **Duration:** The CPU time of each span is shown.
- **Allocated Memory:** How much memory was allocated during the span.
- **Allocations:** How many allocations were made during the span.
- **Deallocated Memory:** How much memory was deallocated during the span.
- **Persistently allocated Memory:** How much memory was allocated but not deallocated during the span. It survives the span.

[turbo-trace-viewer]: https://turbo-trace-viewer.vercel.app/
[youtube-tutorial]: https://www.youtube.com/watch?v=PGO2szAye7A
