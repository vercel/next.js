# Async Formatting

Standard Rust formatting (`format!`, `Display`) is synchronous. In turbo-tasks,
many values live behind `Vc<T>` or `ResolvedVc<T>`, which require `.await` to
read. These macros handle that automatically.

## `turbofmt!` — async `format!`

Returns `Result<RcStr>` after resolving all arguments asynchronously.

```ignore
// Positional arguments
let msg = turbofmt!("asset {} in path {}", asset.ident(), base_path).await?;

// Captured variables
let name = some_vc;
let msg = turbofmt!("hello {name}").await?;
```

Arguments can be `Vc<T>`, `ResolvedVc<T>`, `ReadRef<T>`, or any type
implementing `Display` — they are all resolved automatically.

Arguments with format specifiers (e.g., `{x:?}`) use standard `Debug`/`Display`
formatting directly and are **not** resolved asynchronously.

## `turbobail!` — async `bail!`

Same as `turbofmt!`, but calls `anyhow::bail!()` with the formatted message.
Has implicit `.await` and return flow.

```ignore
turbobail!("asset {} is not in path {}", asset.ident(), base_path);
```

## `#[derive(ValueToString)]`

Generates both `ValueToStringRef` (returning `RcStr`) and `ValueToString`
(returning `Vc<RcStr>`) impls. Fields are resolved asynchronously, so `Vc<T>`
and `ResolvedVc<T>` fields work directly in format strings.

**No attribute** — delegates to `Display::to_string()`:

```ignore
#[derive(ValueToString)]
struct Foo { ... } // requires Display impl
```

**Format string with field references** — fields are resolved async:

```ignore
#[derive(ValueToString)]
#[value_to_string("[{fs}]/{path}")]
struct FileSystemPath { fs: ResolvedVc<...>, path: RcStr }
```

**Format string with explicit expressions:**

```ignore
#[derive(ValueToString)]
#[value_to_string("{}", self.name())]
struct Bar { ... }
```

**Direct expression:**

```ignore
#[derive(ValueToString)]
#[value_to_string(self.inner)]
struct Wrapper { inner: RcStr }
```

**Enums** — variants without an attribute default to their name:

```ignore
#[derive(ValueToString)]
enum Kind {
    Foo,                                    // → "Foo"
    #[value_to_string("custom")]
    Bar,                                    // → "custom"
    #[value_to_string("value is {0}")]
    Baz(ResolvedVc<RcStr>),                 // → "value is ..."
}
```

## `ValueToString` trait

The underlying async trait. You rarely need to implement this manually —
prefer `#[derive(ValueToString)]` instead.

```ignore
#[turbo_tasks::value_trait]
pub trait ValueToString {
    fn to_string(self: Vc<Self>) -> Vc<RcStr>;
}
```

## Resolution Priority

When a value is used in `turbofmt!` or `turbobail!`, it is resolved using the
first matching rule (highest priority first):

| Priority | Type                      | Resolution                                 |
| -------- | ------------------------- | ------------------------------------------ |
| 1        | `ValueToStringRef` impl   | Awaits `ValueToStringRef::to_string_ref()` |
| 2        | `Vc<T>` / `ResolvedVc<T>` | Awaits `ValueToString::to_string()`        |
| 3        | `Display` impl            | Synchronous `Display::to_string()`         |

`#[derive(ValueToString)]` generates both `ValueToStringRef` and
`ValueToString` impls, so derived types resolve at priority 1 when used as
owned values and at priority 2 when used behind `Vc`/`ResolvedVc`.

A type may implement `Display` for a short synchronous representation while
`ValueToStringRef` provides a richer async format, but this is strongly discouraged
and causes confusion. In general, only the sync _XOR_ async formatting functions should be implemented.
