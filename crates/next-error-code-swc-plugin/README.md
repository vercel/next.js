# `swc-plugin` for Next.js Error Code Transformation

## Overview

This plugin transforms Next.js source code by:

- Rewriting `new Error` or `Error` to include an additional property: `Object.defineProperty(new Error(...), "__NEXT_ERROR_CODE", { value: $code, enumerable: false, configurable: true })`. The `enumerable: false` ensures the error code won't show up in console logs while still being accessible for telemetry. The `configurable: true` ensures the error code can be overwritten, useful for transforming errors.
- This enables anonymous error code reporting for user feedback while keeping the message private.

## Error Code Mapping

- **File Location:** `packages/next/errors.json`
- **Structure:** Append-only, increment-based mapping of error codes to messages.
- **Automation:**
  - Running `pnpm build` automatically updates `errors.json` if new errors are introduced.
  - **Commit Reminder:** Always commit the updated `errors.json` file to avoid CI failures.

## Build Process Details

- **Two-Pass Build:**

  1. **First Pass:**
     - Extracts new errors and temporarily stores them in `packages/next/.errors/*.json`.
     - In CI, a build with new errors will fail.
  2. **Second Pass:**
     - Updates `packages/next/errors.json` and reruns the build step to confirm no further new errors.
     - Inspired by React's [error mapping mechanism](https://github.com/facebook/react/tree/main/scripts/error-codes).

- **Concurrency Handling:** The two-pass system ensures reliable ordering of inserted error codes during concurrent builds.

## Modifying the Plugin

- **WASM Rebuild Required:**

  - After modifying the plugin, rebuild the WASM file via `pnpm build-error-code-plugin` and commit it to the repository.
  - **Reason:** Pre-built artifacts simplify the build process (`pnpm build` runs without requiring `cargo`).

- **Testing:** Run `cargo test` inside the `crates/next-error-code-swc-plugin` directory to test the plugin.
