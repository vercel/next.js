# Turbopack trace server WASM

This crate exposes the transport-independent Turbopack trace viewer engine through NAPI-RS v3's browser WASM mode. It is intended to let a browser or Web Worker load a trace without starting the native localhost WebSocket server.

The exported `TurbopackTraceServer` class incrementally accepts raw or gzip-compressed trace chunks through its `read()` method. Its `handleMessage()` method accepts the existing trace viewer client JSON protocol and returns the corresponding server messages in protocol order. The store can be queried while more trace data is still arriving.

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

Zstd-compressed traces remain native-only.

## Build

NAPI-RS v3 uses threaded WASI and its Emnapi runtime for browser modules. Install the `wasm32-wasip1-threads` Rust target, then build through the NAPI CLI so it can link the threaded runtime and generate the browser loader:

```sh
rustup target add wasm32-wasip1-threads
pnpm --filter @vercel/turbopack-trace-server-wasm build
```

The package pins matching NAPI-RS and Emnapi build dependencies and configures `wasm32-wasip1-threads` as its target. The generated browser loader imports `@napi-rs/wasm-runtime` and `@emnapi/runtime`; consuming code must serve those runtime packages, generated worker files, and the `.wasm` file together.

WebAssembly threads use `SharedArrayBuffer`, so the viewer must be served in a cross-origin isolated context with appropriate COOP and COEP headers.

The browser entry configures Rayon's global thread pool from `navigator.hardwareConcurrency` before exporting the trace server. This is necessary because WASI Preview 1 does not expose the host processor count through `std::thread::available_parallelism()`. If the browser does not report a valid count, the pool defaults to four threads.

Consumers of a generated loader directly must call `configureRayonThreadPool(threadCount)` before handling any viewer messages. The configuration is process-wide and can only be set once; repeated calls with the same count are allowed. Node consumers may use `os.availableParallelism()` or the `RAYON_NUM_THREADS` environment variable to choose the count.
