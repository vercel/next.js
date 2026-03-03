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

## Syntax highlighting

The highlighter uses a single compiled regex pass over the visible content to
tokenize strings, comments, numbers, regex literals, and identifiers. Keywords
are identified via a compile-time perfect hash set (`phf`).

### Skip-scan heuristic

For large files, scanning from byte 0 is expensive — the regex tokenizer
dominates runtime. To avoid this, `extract_highlights()` walks backwards from
the visible window looking for a **blank line** and starts the scan there.
A blank line is a safe restart point for single-line constructs (strings,
line comments, regex literals) because they cannot span blank lines.

**Known limitation:** The heuristic can produce incorrect highlighting when a
multi-line construct (block comment or template literal) contains a blank line
that falls between the scan start and the visible window. In this case the
scanner misses the opening delimiter and the closing delimiter / trailing code
may lose its expected coloring. For example:

```js
/** sneaky

*/
const after = 1; // `*/` may lose comment highlighting
```

This is a deliberate tradeoff — blank lines inside block comments or template
literals that span the window boundary are vanishingly rare in practice, and
the consequence is only slightly wrong highlighting, never a failure or missing output.

### Byte-level skip for long lines

When the visible window starts far into a long line (>200 bytes from the
line-level scan start), the heuristic additionally scans backwards from the
visible start for a `;` and restarts the tokenizer there. This is critical for
minified files where the entire source may be a single line — without it the
scanner would tokenize hundreds of kilobytes of invisible content.

**Known limitation:** The `;` can land inside a string literal, causing an
unbalanced quote that cascades incorrect highlighting across the visible window.
In practice minified code has frequent `;` between statements so this rarely
triggers, and the consequence is only incorrect highlighting, never a failure.

## Features

- Caller-provided output width (no terminal detection — sans-io)
- Syntax highlighting for JS, TS, JSX, TSX
- Graceful degradation for non-JS files or parsing errors
- ANSI color support matching babel-code-frame aesthetics
- Support for single-line and multi-line error ranges
