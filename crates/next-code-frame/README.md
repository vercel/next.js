# next-code-frame

Fast, scalable code frame rendering for Next.js error reporting, written in Rust.

This crate provides functionality similar to `@babel/code-frame` but with several improvements:
- **Scalability**: Handles arbitrarily large files efficiently
- **Long line handling**: Gracefully scrolls long lines to keep error positions visible and avoid overwhelming the terminal with long lines
- **Syntax highlighting**: Uses a language-agnostic regex tokenizer for best-effort syntax highlighting

## Design

Following the `next-taskless` pattern, this crate:
- Has no dependency on turbo-tasks, allowing use in webpack/rspack codepaths
- Is compilable to WASM for environments without native bindings
- Follows "sans-io" patterns - the library accepts file content as arguments rather than performing IO

## CLI

A `code_frame` binary is included for quick testing. Pass a filename and start/end positions (1-indexed `line:column`):

```bash
# Highlight a single position
cargo run -p next-code-frame --bin code_frame -- src/app.tsx 10:5

# Highlight a range
cargo run -p next-code-frame --bin code_frame -- src/app.tsx 10:5 10:20

# With an error message
cargo run -p next-code-frame --bin code_frame -- -m "Unexpected token" src/app.tsx 10:5 10:20
```

## Features

- Caller-provided output width (no terminal detection — sans-io)
- Syntax highlighting for JS, TS, JSX, TSX
- Graceful degradation for non-JS files or parsing errors
- ANSI color support matching babel-code-frame aesthetics
- Support for single-line and multi-line error ranges
