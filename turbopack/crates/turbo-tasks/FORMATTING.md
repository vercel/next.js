# Turbo-Tasks Formatting System

This document describes the async-aware formatting system used across turbo-tasks.
It covers `ValueToString`, `ValueToStringify`, `turbofmt!`, `turbobail!`, and
`#[derive(ValueToString)]`.

## Overview

Standard Rust formatting (`format!`, `Display`) is synchronous. In turbo-tasks,
many values live behind `Vc<T>` or `ResolvedVc<T>`, which require `.await` to
read. The formatting system bridges this gap with async-aware alternatives that
can format both plain Rust types and turbo-tasks virtual cell types.

## Key Traits

### `ValueToString`

The async counterpart to `Display`. Returns `Vc<RcStr>` instead of writing to a
formatter:

```rust
#[turbo_tasks::value_trait]
pub trait ValueToString {
    fn to_string(self: Vc<Self>) -> Vc<RcStr>;
}
```

Use `#[derive(ValueToString)]` to implement this automatically.

### `ValueToStringify`

A helper trait that provides unified async string conversion. It uses a
`ValueToStringifyWrap<T>` newtype and const-generic `LEVEL` parameter to enable
**priority-based dispatch** via Rust's auto-deref method resolution, avoiding
coherence conflicts that would arise with plain `&`-level overloading.

The macro `__turbo_stringify!(expr)` wraps the expression in
`ValueToStringifyWrap` and calls `.to_stringify()` through `&&&wrap`, so
auto-deref tries impls in this order (highest priority first):

| Level | Implementation                                  | Matches                     | Behavior                             |
| ----- | ----------------------------------------------- | --------------------------- | ------------------------------------ |
| 0     | `&&&Wrap<&T>` (derive-generated, concrete)      | Owned turbo-tasks values    | Runs the derive-generated async body |
| 1     | `&Wrap<&T> where T: Display` (blanket)          | Owned values with `Display` | Synchronous `Display::to_string()`   |
| 2     | `&&Wrap<&Vc<T>> where T: ValueToString`         | `Vc<T>` references          | Awaits `ValueToString::to_string()`  |
| 2     | `&&Wrap<&ResolvedVc<T>> where T: ValueToString` | `ResolvedVc<T>` references  | Awaits `ValueToString::to_string()`  |
| 3     | `&&&Wrap<&ReadRef<T>> where T: ValueToString`   | `ReadRef<T>` references     | Re-cells then awaits `ValueToString` |

### Resolution Priority

When a type implements **both** `Display` and has a derive-generated
`ValueToStringify`, the derive-generated impl (level 0) takes priority because
it matches at a lower auto-deref depth than the `Display` blanket (level 1).

This means **`ValueToString` takes priority over `Display`** for owned values
in `turbofmt!` and `turbobail!`. A type can implement `Display` for a short
synchronous representation while `ValueToString` provides a richer async format.

**Example:** `FileSystemPath` implements `Display` (writes only `self.path`) and
derives `ValueToString` with `#[value_to_string("[{fs}]/{path}")]`. In
`turbofmt!("{source_path}", ...)`, the `ValueToString` impl is used (full path
with filesystem prefix). The `Display` impl is available for synchronous contexts
like `format!()` or `println!()`.

## Macros

### `turbofmt!`

Async `format!` replacement. Returns `impl Future<Output = Result<RcStr>>`.

```rust
let msg: RcStr = turbofmt!("asset {} in path {}", asset.ident(), base_path).await?;
```

Each argument is resolved via `ValueToStringify::to_stringify().await?`, then
passed to `format!()`. Supports both positional arguments and captured variables:

```rust
let name = some_vc;
turbofmt!("hello {name}").await?  // captures `name` from scope
```

Variables with format specifiers (e.g., `{x:?}`) are **not** resolved via
`ValueToStringify` — they use standard `Debug`/`Display` formatting directly.

### `turbobail!`

Async `bail!` replacement. Resolves arguments then calls `anyhow::bail!()`.

```rust
turbobail!("asset {} is not in path {}", asset.ident(), base_path);
```

Has implicit `.await` and return flow, like `bail!()`. Same argument
resolution rules as `turbofmt!`.

### `#[derive(ValueToString)]`

Generates both a `ValueToString` implementation and a concrete
`ValueToStringify<0> for &&&ValueToStringifyWrap<&T>` implementation. The latter
ensures the derive-generated async body takes priority over the `Display` blanket
when the type is used in `turbofmt!` or `turbobail!`.

**Struct forms:**

```rust
// No attribute: delegates to Display::to_string(self)
#[derive(ValueToString)]
struct Foo { ... } // requires Display impl

// Format string with auto-field references:
#[derive(ValueToString)]
#[value_to_string("[{fs}]/{path}")]
struct FileSystemPath { fs: ResolvedVc<...>, path: RcStr }

// Format string with explicit expressions:
#[derive(ValueToString)]
#[value_to_string("{}", self.name())]
struct Bar { ... }

// Direct expression delegation:
#[derive(ValueToString)]
#[value_to_string(self.inner)]
struct Wrapper { inner: RcStr }
```

**Enum forms:**

```rust
#[derive(ValueToString)]
enum Kind {
    Foo,                                    // → "Foo"
    #[value_to_string("custom")]
    Bar,                                    // → "custom"
    #[value_to_string("value is {0}")]
    Baz(ResolvedVc<RcStr>),                 // → "value is ..."
}
```

Field references in format strings are resolved via `ValueToStringify`, so they
work with `Vc<T>`, `ResolvedVc<T>`, `Display` types, and any type with a
`ValueToStringify` impl.
