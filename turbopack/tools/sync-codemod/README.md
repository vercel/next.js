# sync-codemod

A set of `syn`-based codemods for the dual-mode (async / no-tokio sync)
turbo-tasks migration. Every transformation is selected from Rust syntax nodes;
none search for or replace source text patterns.

## Why this exists (and why ast-grep isn't enough)

The bulk `.await` → `read!` conversion can be done with ast-grep
(`ast-grep run --pattern '$A.await' --rewrite 'turbo_tasks::read!($A)' --lang rust`),
but ast-grep uses tree-sitter, which parses a macro invocation's arguments as an
**opaque token tree**. So awaits *inside* macros — `turbo_tasks::read!(x.await?)`,
`bail!(e.msg().await?)`, `matches!(*x.get().await?, Pat)`, `vec![g.connect().await?]`,
`assert_eq!(r.modules().await?, ..)` — are never matched, and had to be hand-fixed.
Hand-fixing (regex / span-scanning) corrupted match-arms, comments, and multiline
chains repeatedly.

This tool uses the **real Rust parser (`syn`)** so it handles every case a parser
understands, and it recurses into macro token-streams by re-parsing them.

## What makes it correct

- **`syn` AST** → expression boundaries (chain heads), multiline chains, comments,
  match-arms (incl. `{ x, .. }`) and if/else are exact.
- **Surgical byte-range edits** into the original source → formatting/trivia
  preserved (it does NOT regenerate code from the AST, so diffs stay minimal).
- **`visit_macro` re-parses macro tokens as expressions** and recurses, so awaits
  inside `read!`/`bail!`/`vec!`/`assert_eq!`/`matches!`/`format!`/… are found.
  `matches!(expr, Pat)` works because the pattern arg simply fails to parse as an
  expr and is skipped.
- **Innermost-first, multi-pass**: each pass rewrites only awaits whose receiver
  contains no other await (so edits never nest/overlap), then re-parses. Nested
  awaits (`a.await?.b().await?`) resolve over passes. This avoids every
  edit-ordering hazard that broke the hand-rolled attempts.
- **AST-derived function edits**: `dualfn`, `dualtrait`, and `dualimpl` use function,
  impl, attribute, and `async` keyword spans. Text containing `async fn` in strings,
  comments, or nested functions is never changed.

## Usage

```bash
cargo run --manifest-path turbopack/tools/sync-codemod/Cargo.toml -- \
    $(find turbopack/crates/<crate>/src -name '*.rs')
# then:
cargo check -p <crate>            # async must stay green (read! ≡ .await in async)
cargo fmt -p <crate>              # tidy the (minimal) reflow at wrap points
```

Companion transforms are separate because choosing which plain futures must become
dual-mode is a semantic migration step:

```bash
cargo run --manifest-path turbopack/tools/sync-codemod/Cargo.toml --bin dualfn -- <files...>
cargo run --manifest-path turbopack/tools/sync-codemod/Cargo.toml --bin dualtrait -- <files...>
cargo run --manifest-path turbopack/tools/sync-codemod/Cargo.toml --bin dualimpl -- <files...>
```

`dualfn` uses `dual_fn!` where its macro grammar supports the complete signature.
For bounded generics, `where` clauses, const generics, implicit return types, and
qualified functions, it emits equivalent `#[cfg]`-gated async and sync items instead
of skipping or approximating the signature.

It only rewrites `.await`; it does **not** convert `.await` on genuine async I/O
leaves (those are cfg-split to blocking std I/O in the crate's `sync` feature
BEFORE running this) — a `read!` on a leaf future that completes in one poll is
fine, but real Pending-returning I/O must be handled first.

## Not handled (do these separately)

- `#[tokio::test(..)]` → `#[turbo_tasks::test(..)]` (attribute; trivial string swap).
- `futures::try_join!(a, b, c)` macro → `parallel!` (macro→macro shape change;
  the tool leaves it, since `.try_join()` the *method* works in both modes).
- Cargo `sync`/`tokio_runtime` feature scaffolding and tokio-leaf cfg splits.

## Validating

`converted N awaits` is printed. The tool re-parses with `syn` every pass, so a
successful run means the output is syntactically valid Rust. Always follow with
`cargo check` (async) to confirm no behavioral change, then build/test under
`--no-default-features --features sync`.
