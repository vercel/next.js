Utilities for Next.js written without a dependency on turbo-tasks, allowing them to be shared with
webpack and/or rspack codepaths. This crate must be compilable to WASM, so that it works in
environments where no native bindings are available.

These utilities should not perform file IO directly, but instead accept files they depend on as
arguments (preferred) or via async trait methods or callbacks (acceptable). Follow "sans-io"
patterns where possible.
