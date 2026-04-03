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
