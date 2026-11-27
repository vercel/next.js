# Turbopack trace server WASM

This crate exposes the transport-independent Turbopack trace viewer engine through NAPI-RS v3's browser WASM mode. It is intended to let a browser or Web Worker load a trace without starting the native localhost WebSocket server.

The exported `TurbopackTraceServer` class incrementally accepts raw or gzip-compressed trace chunks through its `read()` method. Its `handleMessage()` method accepts the existing trace viewer client JSON protocol and returns the corresponding server messages in protocol order. The store can be queried while more trace data is still arriving.

Gzip output is fed directly to the incremental parser in batches of at most 64 KiB, so a compressed input chunk is not fully expanded into a staging vector before trace validation. Compression detection retains at most four input bytes. This is a staging bound, not a total memory limit: valid traces still grow the store, and incomplete records can grow the parser's input buffer.

Each `read()` call parses synchronously. Pass an optional progress callback to the constructor to receive updates at most once every 250 milliseconds:

```js
const server = new TurbopackTraceServer((progress) => {
  worker.postMessage({ type: 'trace-load-progress', progress })
})

for await (const chunk of traceStream) {
  server.read(chunk)
}
```

The callback receives `bytesRead`, `uncompressedBytesRead`, `elapsedMs`, `bytesPerSecond`, and `stats`. The caller owns the stream and therefore also knows its total size and when loading is complete. Use the API from a Web Worker if parsing must not block the browser UI.

Turbopack traces must use the current `TRACEv1` format, including delta-encoded timestamps. Older versions produce the same explicit version error as the native reader. Zstd- and xz-compressed traces require the file reader/server (`trace-server` feature for WASI bindings); the standalone browser engine omits those dependencies.

## Build

NAPI-RS v3 uses threaded WASI and its Emnapi runtime for browser modules. Install the `wasm32-wasip1-threads` Rust target, then build through the NAPI CLI so it can link the threaded runtime and generate the browser loader:

```sh
rustup target add wasm32-wasip1-threads
pnpm --filter @vercel/turbopack-trace-server-wasm build-trace-wasm
```

The package pins matching NAPI-RS and Emnapi build dependencies and configures `wasm32-wasip1-threads` as its target. This is an explicit build task rather than the monorepo's generic `build` task: the pinned NAPI CLI needs Node 20.17+ or 22.13+, while some monorepo builds run under Node 20.9. The dedicated CI job uses Node 22. The generated browser loader imports `@napi-rs/wasm-runtime` and `@emnapi/runtime`; consuming code must serve those runtime packages, generated worker files, and the `.wasm` file together.

WebAssembly threads use `SharedArrayBuffer`, so the viewer must be served in a cross-origin isolated context with appropriate COOP and COEP headers. The generated loader reserves 8192 initial 64 KiB pages (512 MiB) with a 65536-page (4 GiB) maximum; keep `napi.wasm` in `js/package.json` aligned with the linker memory limits in `.cargo/config.toml`.

The pinned NAPI CLI selects Emnapi's wasi-sdk-34-compatible archive for the current Rust WASI libc. Older alpha archives use a different futex ABI and must not be linked by suppressing linker diagnostics.

The browser entry configures Rayon's global thread pool from `navigator.hardwareConcurrency` before exporting the trace server. This is necessary because WASI Preview 1 does not expose the host processor count through `std::thread::available_parallelism()`. If the browser does not report a valid count, the pool defaults to four threads.

Consumers of a generated loader directly must call `configureRayonThreadPool(threadCount)` before handling any viewer messages. The configuration is process-wide and can only be set once; repeated calls with the same count are allowed. Node consumers may use `os.availableParallelism()` or the `RAYON_NUM_THREADS` environment variable to choose the count.
