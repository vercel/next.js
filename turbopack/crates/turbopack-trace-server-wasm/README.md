# Turbopack trace server WASM

This crate exposes the transport-independent Turbopack trace viewer engine through NAPI-RS v3's browser WASM mode. It is intended to let a browser or Web Worker load a completed trace without starting the native localhost WebSocket server.

The exported `TurbopackTraceServer` class accepts a complete raw or gzip-compressed trace as a `Uint8Array`. Its `handleMessage()` method accepts the existing trace viewer client JSON protocol and returns the corresponding server messages in protocol order.

Zstd-compressed traces and live file tailing remain native-only.

## Build

NAPI-RS v3 uses WASI and Emnapi for browser modules. Install the `wasm32-wasip1` Rust target, then build through the NAPI CLI so it can provide Emnapi's link archive and generate the browser loader:

```sh
rustup target add wasm32-wasip1
pnpm --package=@napi-rs/cli@3 \
  --package=emnapi@2.0.0-alpha.4 \
  --package=@emnapi/runtime@2.0.0-alpha.4 \
  --package=@emnapi/core@2.0.0-alpha.4 \
  dlx napi build \
  --target wasm32-wasip1 \
  --release \
  --manifest-path turbopack/crates/turbopack-trace-server-wasm/Cargo.toml \
  --package-json-path <package.json> \
  --output-dir <output-directory>
```

The package JSON passed to the CLI must configure `napi.binaryName` as `turbopack-trace-server-wasm` and include `wasm32-wasip1` in `napi.targets`. The generated browser loader imports `@napi-rs/wasm-runtime` and `@emnapi/runtime`; the consuming viewer must provide those runtime packages alongside the generated `.wasm` file.
