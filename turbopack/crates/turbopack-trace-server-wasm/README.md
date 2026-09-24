# Turbopack trace server WASM

This crate exposes the transport-independent Turbopack trace viewer engine through NAPI-RS v3's browser WASM mode. It is intended to let a browser or Web Worker load a completed trace without starting the native localhost WebSocket server.

The exported `TurbopackTraceServer` class accepts a complete raw or gzip-compressed trace as a `Uint8Array`. Its `handleMessage()` method accepts the existing trace viewer client JSON protocol and returns the corresponding server messages in protocol order.

Loading is synchronous, so pass an optional progress callback to the constructor before parsing starts. It runs at most once every 250 milliseconds and always receives a final update with `done: true`:

```js
const server = new TurbopackTraceServer(trace, (progress) => {
  worker.postMessage({ type: 'trace-load-progress', progress })
})
```

The callback receives `bytesRead`, `totalBytes`, `uncompressedBytesRead`, `percentage`, `elapsedMs`, `bytesPerSecond`, `etaMs`, `stats`, and `done`. Because construction is synchronous, use the callback from a Web Worker if progress needs to update the browser UI while the trace is loading.

Zstd-compressed traces and live file tailing remain native-only.

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
