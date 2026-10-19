# Turbopack Development Guide

Turbopack is a general-purpose bundler that is built and designed for Next.js, but is not necessarily Next.js-specific. Keep Next.js concepts out of it.

- **Do NOT mention Next.js config options** (e.g. anything under `next.config.js`, `experimental.*`, or other `NextConfig` fields) inside `turbopack/` code, comments, or docs. Refer to Turbopack's own options/inputs instead, and let the Next.js (in `packages/next/`) do the translation from Next.js config to Turbopack options. (This only applies to `turbopack/` — the Next.js-specific crates in `crates/` and `packages/next/` may reference Next.js config options.)
