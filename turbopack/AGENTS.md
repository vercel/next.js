# Turbopack Development Guide

Turbopack is a general-purpose bundler that is built and designed for Next.js, but is not necessarily Next.js-specific. Keep Next.js concepts out of it.

- **Do NOT mention Next.js config options** (e.g. anything under `next.config.js`, `experimental.*`, or other `NextConfig` fields) inside `turbopack/` code, comments, or docs. Refer to Turbopack's own options/inputs instead, and let the Next.js (in `packages/next/`) do the translation from Next.js config to Turbopack options. (This only applies to `turbopack/` — the Next.js-specific crates in `crates/` and `packages/next/` may reference Next.js config options.)

## turbo_tasks caching and invalidation

These rules apply throughout this directory tree when developing with turbo_tasks:

- Keep task cache keys narrow: pass only the inputs the task needs. Avoid build-wide state or large collections when a per-module or per-entry input would suffice.
- Avoid `.cell()` and `Vc::cell()` unless you know the current function is already called by functions with fine-grained cache keys. Inspect the callers and task boundaries before creating cells.
- Pass booleans, enums, and similar small values directly as `TaskInput` where appropriate instead of wrapping them in cells.
- When task inputs need to be cells to preserve fine-grained caching, arrange for them to already be cells returned by `#[turbo_tasks::function]` functions.
- Do not blindly introduce "interning" task functions that only wrap values, such as `Vec<T> -> Vc<Vec<T>>`. Only add such a task when you are certain it is beneficial in that particular situation.
- Existing `.cell()` calls or wrapping tasks are not automatically good precedent. Verify their caller and cache-key assumptions before copying the pattern.
- Put maps containing information for a large part of the build (for example, a map from modules to analysis results) into separate cells. Use `cell = "keyed"` on their value types, for example `#[turbo_tasks::value(transparent, cell = "keyed")]` for a map wrapper.
- Read keyed cells through keyed access, such as `map.get(&key).await?`, so invalidation depends only on the entries actually read. Awaiting the entire map and then looking up a key creates a dependency on the whole map instead.
- When changing task boundaries, check the intended invalidation behavior. An unrelated module change should not invalidate consumers of unchanged keyed entries; correct output alone does not demonstrate good cache granularity.
