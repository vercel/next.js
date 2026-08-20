# Rust crate patches

Patches for crates.io dependencies that need a fix which has not been released yet.

The `.patch` files next to this README are **not** applied automatically, and they do not affect a
normal `cargo build`. Cargo has no support for patch files, and a `[patch.crates-io]` entry in the
root `Cargo.toml` would have to point at a directory that does not exist in a fresh checkout, which
would break every build. So instead:

1. `scripts/patch-rust-crate.mjs` copies the crate's source out of the cargo registry into
   `target/patched-crates/<name>-<version>/` and applies `patches/rust/<name>@<version>.patch`.
2. The build that needs the patch passes the resulting directory to cargo explicitly:

   ```sh
   SWC_DIR="$(node ./scripts/patch-rust-crate.mjs swc 74.0.0)"
   cargo check -p next-napi-bindings --target wasm32-wasip1-threads \
     --config "patch.crates-io.swc.path=\"$SWC_DIR\""
   ```

Builds that don't pass `--config` resolve the crate from the registry as usual.

> **`Cargo.lock` is rewritten by a patched build.** Pointing `[patch]` at a path makes the crate a
> path dependency, so cargo drops its `source` and `checksum` from the lockfile. That change must not
> be committed — restore it afterwards:
>
> ```sh
> git checkout -- Cargo.lock
> ```
>
> `--locked` is not an alternative: the patch legitimately requires a lockfile change, so cargo would
> refuse to run at all.

Prefer this over vendoring or a git fork when the fix is small and expected to land upstream soon:
the patch file is the diff you send upstream, and deleting it once the fix is released is a one-line
change.

## Current patches

### `swc@74.0.0.patch`

Makes `swc`'s `cfg(all(feature = "plugin", target_arch = "wasm32"))` code path compile. That path
has apparently never been built by anyone, and has two errors:

- `RustPlugins::apply_inner` returns `n` where the signature is `Result<Program, anyhow::Error>`.
- `transform_metadata_context` is unused on wasm32, and the crate sets `#![deny(unused)]`.

Needed because anything enabling `swc_core`'s `__plugin_transform_host` — which
`turbopack-ecmascript-plugins`, and therefore `next-core`, does — otherwise fails to compile for
wasm. Used by the `test-next-napi-bindings-wasi` CI job.

Note SWC deliberately skips wasm plugin transforms on wasm32 (see
[swc#3934](https://github.com/swc-project/swc/issues/3934)), so this only fixes compilation; SWC
wasm plugins are still unavailable in a wasm build of Next.js. Delete this patch once the fixes are
released upstream.
