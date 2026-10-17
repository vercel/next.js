# turbopack-lightningcss-napi

A vendored, lightly-modified port of the upstream `lightningcss-napi` crate
(the `napi` bindings glue that lives in the [lightningcss] repository under
`node/`, published to crates.io as [`lightningcss-napi`]).

[lightningcss]: https://github.com/parcel-bundler/lightningcss
[`lightningcss-napi`]: https://crates.io/crates/lightningcss-napi

## Provenance

- Upstream crate: `lightningcss-napi` **0.4.6** (source: `node/src/` in the
  lightningcss repository; the workspace's `lightningcss` dependency is
  pinned to the matching `1.0.0-alpha.70`).
- Vendored: July 2026, as part of the napi-rs v2 → v3 migration of the
  Next.js native bindings.

## Why it is vendored

Upstream `lightningcss-napi` pins `napi ^2` and cannot coexist with the napi
v3 bindings used by `next-napi-bindings`; a single Node.js addon must link
exactly one copy of the napi runtime. This crate is the upstream source
ported to the napi v3 API so the whole workspace can build against napi 3.x.

## Local modifications relative to upstream 0.4.6

- Ported from napi v2 to the napi v3 API: lifetime-carrying
  `Object`/`Unknown` value types, `Function`/`FunctionRef` instead of
  `JsFunction`, and the v3 reference/visitor plumbing in `transformer.rs`.
  This also fixed the JS visitor bridge, which silently no-op'd under a v3
  runtime via the v2 compat path (breaking CSS `url()`/`@import` rewriting
  and CSS-module handling).
- The `bundle`/`bundleAsync` APIs and the standalone cdylib/npm packaging
  were dropped; only the `transform` and `transform_style_attribute`
  entrypoints consumed by `crates/next-napi-bindings/src/css/mod.rs` are
  kept, exposed as plain Rust functions rather than `#[napi]` exports.
- No behavioral changes to CSS handling are intended. Upstream style-lint
  violations are `#![allow(...)]`-ed in `lib.rs` instead of rewritten, to
  keep diffs against upstream small.

## When to delete this crate

Delete this crate and depend on upstream again once `lightningcss-napi`
publishes a napi v3-compatible release (track
<https://github.com/parcel-bundler/lightningcss/issues>). When re-syncing
bug fixes in the meantime, diff against upstream `node/src/` at 0.4.6.
