# Turbopack trace server WASM

This crate exposes the transport-independent Turbopack trace viewer engine through NAPI-RS v3's browser WASM mode. It is intended to let a browser or Web Worker load a completed trace without starting the native localhost WebSocket server.

The exported `TurbopackTraceServer` class accepts a complete raw or gzip-compressed trace as a `Uint8Array`. Its `handleMessage()` method accepts the existing trace viewer client JSON protocol and returns the corresponding server messages in protocol order.

Zstd-compressed traces and live file tailing remain native-only.

## Build

NAPI-RS v3 uses threaded WASI and its Emnapi runtime for browser modules. Install the `wasm32-wasip1-threads` Rust target, then build through the NAPI CLI so it can link the threaded runtime and generate the browser loader:

```sh
rustup target add wasm32-wasip1-threads
pnpm --filter @vercel/turbopack-trace-server-wasm build
```

The package pins matching NAPI-RS and Emnapi build dependencies and configures `wasm32-wasip1-threads` as its target. The generated browser loader imports `@napi-rs/wasm-runtime` and `@emnapi/runtime`; consuming code must serve those runtime packages, generated worker files, and the `.wasm` file together.

WebAssembly threads use `SharedArrayBuffer`, so the viewer must be served in a cross-origin isolated context with appropriate COOP and COEP headers.
