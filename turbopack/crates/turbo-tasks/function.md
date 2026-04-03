Tasks are created by defining a Rust function annotated with the `#[turbo_tasks::function]` macro and calling it with arguments. Each unique combination of function and arguments create a new task at runtime. Tasks are the fundamental units of work within the build system.

```rust
#[turbo_tasks::function]
fn add(a: i32, b: i32) -> Vc<Something> {
    // Task implementation goes here...
}
```

- Tasks can be implemented as either a **synchronous or asynchronous** function.
- Arguments must implement the **[`TaskInput`] trait**. Usually these are primitives or types wrapped in [`Vc<T>`].
- The **external signature** of a task always **returns a [`Vc<T>`]** or an [`OperationVc<T>`].
- **Generics** (type or lifetime parameters) are **not supported** in task functions.

[`Vc<T>`]: crate::Vc
[`TaskInput`]: crate::TaskInput

## External Signature Rewriting

The `#[turbo_tasks::function]` macro **rewrites the arguments and return values** of functions. The rewritten function signature is referred to as the **"external signature"**.

### Argument Rewrite Rule

- Function arguments with the **[`ResolvedVc<T>`]** type are **rewritten to [`Vc<T>`].**
  - The value cell is automatically resolved when the function is called. This reduces the work needed to convert between `Vc<T>` and `ResolvedVc<T>` types.
  - This rewrite applies for [`ResolvedVc<T>`] types nested inside of `Option<ResolvedVc<T>>` and `Vec<ResolvedVc<T>>`. For more details, refer to the [`FromTaskInput`] trait.

- Method arguments of **`&self`** are **rewritten to `self: Vc<Self>`**.

[`ResolvedVc<T>`]: crate::ResolvedVc
[`FromTaskInput`]: crate::task::FromTaskInput

### Return Type Rewrite Rules

- A return type of **`Result<Vc<T>>` is rewritten into `Vc<T>`**.
  - The `Result<Vc<T>>` return type allows for idiomatic use of the `?` operator inside of task functions.
- A function with **no return type** is rewritten to return **`Vc<()>` instead of `()`**.
- The **[`impl Future<Output = Vc<T>>`][Future]** type implicitly returned by an async function is **flattened into the `Vc<T>` type**, which implements [`IntoFuture`] and can be `.await`ed.

Some of this logic is represented by the [`TaskOutput`] trait and its associated [`Return`] type.

[`TaskOutput`]: crate::task::TaskOutput
[`Return`]: crate::task::TaskOutput::Return

### External Signature Example

As an example, the method

```rust
#[turbo_tasks::function]
async fn foo(
    &self,
    a: i32,
    b: Vc<i32>,
    c: ResolvedVc<i32>,
    d: Option<Vec<ResolvedVc<i32>>>,
) -> Result<Vc<i32>> {
    // ...
}
```

will have an external signature of

```rust
fn foo(
    self: Vc<Self>,           // was: &self
    a: i32,
    b: Vc<i32>,
    c: Vc<i32>,               // was: ResolvedVc<i32>
    d: Option<Vec<Vc<i32>>>,  // was: Option<Vec<ResolvedVc<i32>>>
) -> Vc<i32>;                 // was: impl Future<Output = Result<Vc<i32>>>
```

## Attributes

The `#[turbo_tasks::function]` macro accepts optional attributes that modify the behavior of the
task. Multiple attributes can be combined by separating them with commas.

```rust
#[turbo_tasks::function(fs, session_dependent)]
async fn read_file(path: RcStr) -> Result<Vc<FileContent>> {
    // ...
}
```

### `operation`

Marks the task as an **operation**. The external signature will return an [`OperationVc<T>`] instead
of a [`Vc<T>`], and all arguments must implement `OperationValue`. Operation tasks serve as explicit
entry points into the task graph and can be used to connect non-reactive code to the reactive
computation graph. Mutually exclusive with `&self` receivers.

### `root`

Marks the task as a **root** in the aggregation graph. Root tasks start with the maximum aggregation
number (`u32::MAX`), which places them at the top of the aggregation tree. This is used for tasks
that represent top-level entry points into the computation.

### `fs`

An **I/O marker** indicating the task directly performs filesystem operations. This should only be
applied to the task that directly performs the I/O, not tasks that transitively call it.

### `network`

An **I/O marker** indicating the task directly performs network operations. Like `fs`, this should
only be applied to the task that directly performs the I/O.

### `session_dependent`

Marks the task as **session dependent**. Session-dependent tasks are re-executed when restored from
persistent cache because they depend on external state (filesystem, environment, network) that may
have changed between sessions.

When a session-dependent task completes, it is not marked as fully clean — it retains a special
"session dependent" dirty state. If the task is later restored from persistent cache in a new
session, this state causes it to be re-executed rather than reusing the cached result.

Typical use cases:

- **Filesystem reads** — file contents may have changed on disk between sessions.
- **Environment variable reads** — process environment may differ between sessions.
- **Network requests** — remote resources may return different results.

```rust
#[turbo_tasks::function(fs, session_dependent)]
async fn read(&self, path: FileSystemPath) -> Result<Vc<FileContent>> {
    // File contents may have changed since the last session,
    // so this task is always re-executed on cache restore.
    // ...
}

#[turbo_tasks::function(session_dependent)]
fn read_all_env(&self) -> Vc<TransientEnvMap> {
    // Environment variables may differ between sessions.
    Vc::cell(self.vars.clone())
}
```

Note: `session_dependent` should be applied to the **leaf task** that directly reads external state.
Tasks that transitively depend on a session-dependent task do not need this attribute — they will
naturally re-execute when the session-dependent task they depend on produces a new result.

[`OperationVc<T>`]: crate::OperationVc

## Methods and Self

Tasks can be methods associated with a value or a trait implementation using the [`arbitrary_self_types` nightly compiler feature][self-types].

[self-types]: https://github.com/rust-lang/rfcs/blob/master/text/3519-arbitrary-self-types-v2.md

### Inherent Implementations

```rust
#[turbo_tasks::value_impl]
impl Something {
    #[turbo_tasks::function]
    fn method(self: Vc<Self>, a: i32) -> Vc<SomethingElse> {
        // Receives the full `Vc<Self>` type, which we must `.await` to get a
        // `ReadRef<Self>`.
        vdbg!(self.await?.some_field);

        // The `Vc` type is useful for calling other methods declared on
        // `Vc<Self>`, e.g.:
        self.method_resolved(a)
    }

    #[turbo_tasks::function]
    fn method_resolved(self: ResolvedVc<Self>, a: i32) -> Vc<SomethingElse> {
        // Same as above, but receives a `ResolvedVc`, which can be `.await`ed
        // to a `ReadRef` or dereferenced (implicitly or with `*`) to `Vc`.
        vdbg!(self.await?.some_field);

        // The `ResolvedVc<Self>` type can be used to call other methods
        // declared on `Vc<Self>`, e.g.:
        self.method_ref(a)
    }

    #[turbo_tasks::function]
    fn method_ref(&self, a: i32) -> Vc<SomethingElse> {
        // As a convenience, receives the fully resolved version of `self`. This
        // does not require `.await`ing to read.
        //
        // It can access fields on the struct/enum and call methods declared on
        // `Self`, but it cannot call other methods declared on `Vc<Self>`
        // (without cloning the value and re-wrapping it in a `Vc`).
        Vc::cell(SomethingElse::new(self.some_field, a))
    }
}
```

- **Declaration Location:** The methods are defined on [`Vc<T>`] (i.e. `Vc::<Something>::method` and `Vc::<Something>::method2`), not on the inner type.

- **`&self` Syntactic Sugar:** The `&self` argument of a `#[turbo_tasks::function]` implicitly reads the value from `self: Vc<Self>`.

- **External Signature Rewriting:** All of the signature rewrite rules apply here. `self` can be [`ResolvedVc<T>`]. `async` and `Result<Vc<T>>` return types are supported.

### Trait Implementations

```rust
#[turbo_tasks::value_impl]
impl Trait for Something {
    #[turbo_tasks::function]
    fn method(self: Vc<Self>, a: i32) -> Vc<SomethingElse> {
        // Trait method implementation...
        //
        // `self: ResolvedVc<Self>` and `&self` are also valid argument types!
    }
}
```

For traits, only the external signature (after rewriting) must align with the trait definition.
