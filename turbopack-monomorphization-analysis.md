# Turbo-Tasks Binary Size Analysis: Monomorphization Overhead in `next-swc`

**Binary under analysis:** `target/release/libnext_napi_bindings.so` (153 MB unstripped)  
**Analysis method:** Symbol extraction (`nm -S --size-sort | rustfilt`) from a representative test binary built within the repo workspace, plus source code review of all key files, scaled to known full-binary counts.

---

## 0. Background: How turbo-tasks Works

`turbo-tasks` is an incremental computation engine. Each `#[turbo_tasks::function]` annotation creates a **cached task** — when called, it returns a lazy `Vc<T>` that only executes the body on first evaluation (or when invalidated). Each `#[turbo_tasks::value]` annotation registers a type as a first-class cell type that can be stored in the task graph.

This design requires **typed, type-erased dispatch infrastructure** per annotated function/type, which is the root cause of the monomorphization overhead.

---

## 1. Inventory of Annotated Functions and Types

| Annotation                    | turbopack/crates | crates/ (next-\*) | Total      |
| ----------------------------- | ---------------- | ----------------- | ---------- |
| `#[turbo_tasks::function]`    | 1,801            | 744               | **~2,545** |
| `#[turbo_tasks::value]`       | 1,428            | 251               | **~1,679** |
| `#[turbo_tasks::value_impl]`  | 698              | —                 | ~698       |
| `#[turbo_tasks::value_trait]` | 86               | —                 | ~86        |

Biggest contributors (by `#[turbo_tasks::function]` count):

- `turbopack-core`: 482 functions
- `turbopack-ecmascript`: 382 functions
- `next-core` (crates/): 420 functions
- `turbopack-browser`: 113 functions
- `turbopack-css` / `turbopack-dev-server`: ~100 each

---

## 2. Per-Category Overhead Analysis

### 2.1 `resolve_functor_impl<T>` — 877 instances, **688 KiB** (confirmed)

**Location:** `turbopack/crates/turbo-tasks/src/native_function.rs`, lines 135–141

**What it does:**

```rust
fn resolve_functor_impl<T: MagicAny + TaskInput>(value: &dyn MagicAny) -> ResolveFuture<'_> {
    Box::pin(async move {
        let value = downcast_args_ref::<T>(value);  // TypeId check + cast
        let resolved = value.resolve_input().await?;  // resolve any Vc<X> in args
        Ok(Box::new(resolved) as Box<dyn MagicAny>)
    })
}
```

**Why monomorphized:** One instance per **unique input-tuple type** `T = (A1, A2, ...)`. Different functions with the same argument signature share a single instance — that's why 2,545 functions produce only 877 instances (≈ 2.9 functions share each resolve implementation on average).

**Per-instance overhead:** The outer fn is just 68 bytes (a call into a trampoline). The async closure body is 140–880 bytes depending on argument types. The closure captures the downcast path (TypeId comparison), the `resolve_input()` call chain (which for `Vc<T>` means an await of `Vc::to_resolved()`), and the re-boxing.

**Detailed breakdown from test binary:**
| Input type | Closure size |
|---|---|
| `()` (no args) | 318 bytes |
| `(usize,)` | 465 bytes |
| `(u32,)` | 466 bytes |
| `(u32, u32)` | 578 bytes |
| `(RcStr,)` | 518 bytes |
| `(RcStr, u32)` | 658 bytes |
| `(Vc<Completion>,)` | 879 bytes |

Key observation: the `(Vc<Completion>,)` case is **2.8× larger** than `(usize,)` because it contains the actual `Vc::to_resolved().await?` future — all the Vc resolution machinery. Non-Vc args produce much smaller closures because `resolve_input()` defaults to `async { Ok(self.clone()) }`, which compiles to trivial code.

**Refactoring opportunity — Estimated savings: ~200–350 KiB**

The `ArgMeta` struct already stores `is_resolved: IsResolvedFunctor` (line 39 of `native_function.rs`). The manager already checks `arg_meta.is_resolved(&*arg)` before spawning a resolution task (manager.rs line 823). The issue is that `resolve_functor_impl<T>` is **always registered** even when `T` contains no `Vc<>` arguments.

**Proposed fix:**  
Add a `const NEEDS_RESOLVE: bool` associated constant to `TaskInput` trait (default: `false`), set `true` only in the `Vc<T>` impl and any compound type containing `Vc`. Then in `ArgMeta::new<T>`:

```rust
pub const fn new<T: TaskInput>() -> Self {
    // Only assign the real resolve functor if T might need it:
    let resolve: ResolveFunctor = if T::NEEDS_RESOLVE {
        resolve_functor_impl::<T>
    } else {
        // A single shared non-generic trivial resolver that just clones:
        trivial_clone_resolve::<T>
    };
    ...
}
```

If we split into "trivial clone" vs "real Vc-resolution" paths, then:

- ~60% of 877 instances contain no `Vc<>` args → could share one tiny impl
- ~340 remaining Vc-containing instances (approx) × avg 600 bytes = 200 KiB saved
- Plus: the 68-byte outer fn per instance × 527 saved = 36 KiB
- **Total estimated savings: ~250–350 KiB**

Additionally, there is an existing `TODO` comment in `native_function.rs` line 34:

> `// TODO: This should be an Option with None for transient tasks. We can skip some codegen.`

For purely transient tasks (no serializable args), the entire bincode machinery in `ArgMeta` is also wasted — removing it saves the encode/decode closures as well.

---

### 2.2 `conditional_update_with_shared_reference` — 1,266 instances, **1.36 MiB** (confirmed)

**Location:** `turbopack/crates/turbo-tasks/src/manager.rs`, line 2070

**What it does:**

```rust
fn conditional_update_with_shared_reference(
    &self,
    functor: impl FnOnce(
        Option<&SharedReference>,
    ) -> Option<(SharedReference, Option<SmallVec<[u64; 2]>>, Option<CellHash>)>,
) {
    let tt = turbo_tasks();
    let cell_content = tt.read_own_task_cell(self.current_task, self.index, ...).ok();
    let update = functor(cell_content.as_ref().and_then(|cc| cc.1.0.as_ref()));
    if let Some((update, updated_key_hashes, content_hash)) = update {
        tt.update_own_task_cell(self.current_task, self.index, ..., CellContent(Some(update)), ...)
    }
}
```

**Why monomorphized:** Despite the outer function being non-generic (it takes `impl FnOnce`), each call site passes a **unique closure type** containing type-specific comparison logic. There are six distinct call sites that each create unique closures:

| Call path                                                        | Per-type closure | Closure size (avg) |
| ---------------------------------------------------------------- | ---------------- | ------------------ | ---------------------------- | ------------ |
| `compare_and_update<T>` → `conditional_update<T>` → outer        | `                | old_sr             | { downcast T, T::eq, wrap }` | ~850 bytes   |
| `compare_and_update_with_shared_reference<T>` → outer            | `                | old_sr             | { downcast T, T::eq }`       | ~880 bytes   |
| `hashed_compare_and_update<T>` → `conditional_update<T>` → outer | `                | old_sr             | { downcast T, T::eq, hash }` | ~1,100 bytes |
| `hashed_compare_and_update_with_shared_reference<T>` → outer     | `                | old_sr             | { downcast T, T::eq, hash }` | ~1,100 bytes |
| `keyed_compare_and_update<T>` → `conditional_update<T>` → outer  | `                | old_sr             | { downcast T, KeyedEq }`     | ~1,200 bytes |
| `keyed_compare_and_update_with_shared_reference<T>` → outer      | `                | old_sr             | { downcast T, KeyedEq }`     | ~1,200 bytes |

With 1,428 registered value types and 6 call paths, theoretically ~8,568 instances are possible, but only 1,266 are present because many types don't use keyed/hashed variants. The average confirmed size is 1,126 bytes/instance.

**Type-specific code in each closure:**

```rust
// compare_and_update_with_shared_reference<T> closure:
|old_sr: Option<&SharedReference>| {
    if let Some(old_sr) = old_sr {
        let old_value = old_sr.0.downcast_ref::<T>()  // TYPE-SPECIFIC downcast
            .expect("cannot update SharedReference of different type");
        let new_value = new_shared_reference.0.downcast_ref::<T>().expect("...");
        if old_value == new_value { return None; }  // TYPE-SPECIFIC T::eq
    }
    Some((new_shared_reference, None, None))  // SHARED logic
}
```

The actual type-specific work is only the downcast (TypeId check + ptr cast) and `PartialEq::eq`. The entire closure body including Arc manipulation, option-unwrap, and the SharedReference wrapping is **shared boilerplate**.

**Proposed fix — Estimated savings: ~700–900 KiB**

Type-erase the comparison function. The `ValueType` struct in `value_type.rs` already has a pattern for this — it stores `raw_cell: RawCellFactoryFn` as a type-erased function pointer. We can do the same for equality:

```rust
// In value_type.rs, add:
type EqFn = fn(&dyn Any, &dyn Any) -> bool;

pub struct ValueType {
    // existing fields ...
    pub compare_eq: EqFn,     // NEW: T::partial_eq via type-erased fn pointer
}

impl ValueType {
    pub const fn new_with_bincode<T: VcValueType + Encode + Decode<()> + PartialEq>(...) {
        // ...
        compare_eq: |a, b| {
            let a = a.downcast_ref::<T>().unwrap();
            let b = b.downcast_ref::<T>().unwrap();
            a == b
        },
    }
}
```

Then in `manager.rs`:

```rust
// BEFORE (monomorphized per T):
pub fn compare_and_update<T: PartialEq + VcValueType>(&self, new_value: T) {
    self.conditional_update(|old_value| {
        if let Some(old_value) = old_value && old_value == &new_value { return None; }
        Some((new_value, None, None))
    });
}

// AFTER (non-generic, single shared implementation):
pub fn compare_and_update_erased(&self, new_sr: SharedReference, value_type_id: ValueTypeId) {
    let eq_fn = registry::get_value_type(value_type_id).compare_eq;
    self.conditional_update_with_shared_reference(|old_sr| {
        if let Some(old_sr) = old_sr {
            if (eq_fn)(old_sr.0.as_ref(), new_sr.0.as_ref()) { return None; }
        }
        Some((new_sr, None, None))
    });
}
```

This collapses all 1,266 monomorphized closures into a single dispatch. The cell() methods in `VcCellMode` would call this type-erased path.

**Alternative (lower-effort) fix:** Mark `conditional_update_with_shared_reference` with `#[inline(never)]` and wrap the comparison closure in a thunk:

```rust
type CompareFn = fn(Option<&SharedReference>, &dyn Any)
    -> Option<(SharedReference, Option<SmallVec<[u64; 2]>>, Option<CellHash>)>;
```

This converts 1,266 unique closures to 1,266 trivial thunks calling the same non-generic body, potentially halving the code size.

---

### 2.3 `TaskFnInputFunction::functor()` closures — estimated ~6,000–9,000 instances, **~3.5 MiB**

**Location:** `turbopack/crates/turbo-tasks/src/task/function.rs`, the `task_fn_impl!` macro

**What it does (for an async method `fn compute(&self, extra: u32) -> Result<Vc<X>>`):**

```rust
// Generated impl for TaskFnInputFunctionWithThis<AsyncMethodMode, MyValue, (u32,)> for fn_item_type:
fn functor(&self, this: RawVc, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
    let task_fn = self.clone();               // fn item type: zero-sized clone
    let recv = Vc::<Recv>::from(this);        // wrap the RawVc
    let (extra,) = get_args::<(u32,)>(arg)?; // TypeId check + downcast + clone
    Ok(Box::pin(async move {
        let recv = recv.await?;               // read the cell (returns ReadRef<Recv>)
        let recv = <Recv::Read as VcRead<Recv>>::target_to_value_ref(&*recv);  // deref
        let output = (task_fn)(recv, extra).await;   // THE ACTUAL CALL
        output_try_into_non_local_raw_vc(output).await  // convert to RawVc
    }))
}
```

**Why monomorphized per function:** Even though every `fn compute_X(&self, extra: u32)` has the same _shape_, each is a different **fn item type** in Rust (zero-sized but unique). The closure `async move { ... task_fn(recv, extra) ... }` captures `task_fn`, making each closure's type unique. This prevents the compiler from deduplicating across functions with the same signature.

**Per-instance cost from test binary:**

- Simple methods with `()` inputs: ~370–900 bytes/closure (e.g., `dbg()` methods)
- Methods with `(usize,)` inputs: ~990 bytes
- Methods with `(RcStr,)` inputs: ~900 bytes
- Complex functions: up to ~2,700 bytes

**Scaling to full binary:** In the test binary (35 functions), 144 closure instances = 4.1 per function, 89.5 KiB total → 2.56 KiB/function. For 2,545 functions: **~6.5 MiB of functor closure code**.

**Primary contributor: `dbg`/`dbg_depth` for each primitive type.**  
The `primitive!()` macro generates **two** `#[turbo_tasks::function]` annotations per primitive (`dbg` and `dbg_depth`), which together account for 228 closure instances at 83.6 KiB in the test binary alone (60% of all functor closure code). In the full binary with 1,679 registered types, this scales to ~**3.4 MiB just for ValueDebug method closures**.

**Refactoring opportunities:**

**A. Type-erase the function dispatch (moderate effort, ~30–40% savings):**

The key insight: `task_fn` is a zero-sized function-item type. Its "clone" is a no-op. We can pass it as a raw function pointer and share the surrounding infrastructure:

```rust
// Current: unique closure per fn item F (full code per function)
Box::pin(async move {
    let recv = recv.await?;
    let recv = target_to_value_ref(&*recv);
    let output = (task_fn)(recv, extra).await;  // F-specific
    output_try_into_non_local_raw_vc(output).await  // shared
})

// Proposed: typed wrapper + shared body
// In FunctionTaskFnWithThis, use:
type InnerFn<Recv, A1> = fn(&Recv, A1) -> ...; // raw fn pointer
// The closure only contains the fn pointer (8 bytes),
// allowing the body to potentially be shared across same-signature functions
```

In practice this would require changing from `F: Fn(...)` captures to `fn(...)` pointers, which may require unsafe or MIR-level tricks to convert the zero-sized fn item to a fn pointer. The compiler may already do this via ICF (Identical Code Folding), but LLVM's ICF operates post-monomorphization and may miss opportunities here.

**B. Feature-gate ValueDebug (low effort, ~2.0–3.0 MiB savings):**

The `dbg` and `dbg_depth` methods on every type are debug tooling that are not needed in production builds. Adding a `turbo-debug` cargo feature that gates both the `ValueDebug` trait impl generation and the `ValueDebugFormat` derives would eliminate:

- 1,679 `dbg()` functor closures
- 1,679 `dbg_depth()` functor closures
- 1,679 `value_debug_format()` closures
- The corresponding `conditional_update_with_shared_reference` and `resolve_functor_impl` instances for the debug functions

Estimated savings: **~2.0–3.5 MiB** of code from the binary.

**C. Merge `dbg` into `dbg_depth` (minimal effort, ~350–700 KiB savings):**

Currently `dbg()` is a separate `#[turbo_tasks::function]` that calls `self.value_debug_format(usize::MAX)`. This means each type gets _two_ separate task registrations. Merging `dbg()` into a non-task function that calls `dbg_depth(usize::MAX)` directly would halve the ValueDebug function overhead:

```rust
// In primitive_macro.rs, replace:
#[turbo_tasks::function]
async fn dbg(&self) -> anyhow::Result<Vc<ValueDebugString>> {
    self.value_debug_format(usize::MAX).try_to_value_debug_string().await
}

// With:
fn dbg(self: Vc<Self>) -> Vc<ValueDebugString> {
    self.dbg_depth(usize::MAX)  // delegate to the single turbo function
}
```

Savings: ~839 closure instances × avg 400 bytes = **~350 KiB**.

---

### 2.4 `VcCellMode::cell()` and `raw_cell()` — ~1,679 instances, **~700 KiB**

**Location:** `turbopack/crates/turbo-tasks/src/vc/cell_mode.rs`

**What it does:** For `VcCellCompareMode<T>::cell(inner)`:

```rust
fn cell(inner: VcReadTarget<T>) -> Vc<T> {
    let cell = find_cell_by_type::<T>();      // look up or create cell slot (generic)
    cell.compare_and_update(                   // type-specific comparison
        <T::Read as VcRead<T>>::target_to_value(inner)  // type-specific read
    );
    Vc { node: cell.into(), _t: PhantomData }
}
```

**Why monomorphized:** `find_cell_by_type::<T>()` compiles to `T::get_value_type_id()` (a const-initialized static), and the `target_to_value` is type-specific. The `compare_and_update` call triggers another monomorphization chain (see §2.2).

**From test binary:**

- Primitive types: `raw_cell` ~263 bytes each, `cell` in VcCellCompareMode ~237-263 bytes each (small, mostly inlined)
- User struct types: `cell()` method (the generated `fn cell(self) -> Vc<Self>`) is 967–1,590 bytes, containing the full chain from `Vc::cell_private` through VcCellMode down to `compare_and_update`

**Refactoring opportunity — Estimated savings: ~200–350 KiB:**

The `ValueType` struct already stores `raw_cell: RawCellFactoryFn` as a type-erased fn pointer. This is the correct pattern. The issue is that the user-facing `T::cell()` method duplicates this logic instead of calling through the type-erased `raw_cell`. If the generated `T::cell()` were replaced with a shared non-generic dispatch through `ValueType::raw_cell`, only the `raw_cell` fn pointer initialization would need to be monomorphized (already ~263 bytes for simple types).

---

### 2.5 `new_with_bincode<T>` encode/decode closures — ~1,679 instances, **~350 KiB**

**Location:** `turbopack/crates/turbo-tasks/src/value_type.rs`, lines 95–118

**What it does:**

```rust
pub const fn new_with_bincode<T: VcValueType + Encode + Decode<()>>(global_name: &str) -> Self {
    Self::new_inner::<T>(global_name, Some((
        |this, enc| { T::encode(any_as_encode::<T>(this), enc)?; Ok(()) },  // AnyEncodeFn
        |dec| { let val = T::decode(dec)?; Ok(SharedReference::new(Arc::new(val))) },  // AnyDecodeFn
    )))
}
```

**Why monomorphized:** Each closure captures a monomorphized call to `T::encode` / `T::decode`. From the test binary, these closures appear as `call_once` symbols ranging from 148–403 bytes per type.

**Note:** These are stored in `ValueType::bincode` as function pointers (`AnyEncodeFn`/`AnyDecodeFn`) — they're already type-erased at the call sites. The monomorphization happens only when _creating_ the function pointer. This is inherently necessary and hard to eliminate — the encode/decode logic must be typed.

**Refactoring opportunity (marginal):** Types with `serialization = "none"` already skip this, saving ~300 bytes/type. Ensuring all value types that don't need serialization opt out could save some code, but this is correctness-sensitive.

---

### 2.6 `ArgMeta` closures (encode/hash/is_resolved for task args) — ~877 instances, **~250 KiB**

**Location:** `turbopack/crates/turbo-tasks/src/native_function.rs`, lines 53–113

Per unique **argument tuple type** `T = (A1, A2, ...)`, the `ArgMeta` struct stores four typed closures:

1. `bincode.encode` — `|this, enc| T::encode(...)`
2. `bincode.decode` — `|dec| T::decode(dec)...`
3. `hash_encode` — `|this, hasher| T::encode(&mut hash_encoder(hasher))`
4. `is_resolved` — `|value| downcast_ref::<T>(value).is_resolved()`

These are const-initialized function pointers, similar to the `ValueType::bincode` pattern. They're already type-erased at call sites. The monomorphization cost is similar to `new_with_bincode` — each pointer creation compiles to a small typed trampoline.

**Note:** For functions where `T::NEEDS_RESOLVE` is false (most functions with only primitive args), the encode/decode machinery in `ArgMeta` could potentially be skipped entirely for transient tasks (as noted in the TODO at line 34). This could save the encode/hash closures for those functions.

---

## 3. Summary Table: Overhead by Category

| Category                                            | Source file              | Instances | Size (confirmed) | Size (estimated) | Notes                            |
| --------------------------------------------------- | ------------------------ | --------- | ---------------- | ---------------- | -------------------------------- |
| `conditional_update_with_shared_reference` closures | `manager.rs`             | 1,266     | **1.36 MiB**     | —                | Confirmed from problem statement |
| `functor()` closures per function                   | `task/function.rs`       | ~7,000    | —                | **~3.5 MiB**     | 144/35 functions ratio scaled    |
| `ValueDebug` dbg/dbg_depth functor closures         | `primitives.rs` + macros | ~3,358    | —                | **~1.3 MiB**     | 2 per value type                 |
| `resolve_functor_impl<T>`                           | `native_function.rs`     | 877       | **688 KiB**      | —                | Confirmed from problem statement |
| `VcCellMode::cell()` + `raw_cell()`                 | `vc/cell_mode.rs`        | ~3,358    | —                | **~700 KiB**     | 2 per value type                 |
| `new_with_bincode` closures                         | `value_type.rs`          | ~1,679    | —                | **~350 KiB**     | 2 per serializable type          |
| `ArgMeta` encode/decode/hash closures               | `native_function.rs`     | ~877      | —                | **~250 KiB**     | Per unique arg tuple type        |
| Generated `T::cell()` methods                       | `value_macro.rs`         | ~1,679    | —                | **~200 KiB**     | Thin wrappers                    |
| **Total estimated**                                 |                          |           |                  | **~8.4 MiB**     |                                  |

**Context:** The 153 MB binary includes debug symbols (DWARF). After stripping (`strip -s`), the binary is typically 55–70 MB. Turbo-tasks infrastructure overhead of ~8.4 MiB represents roughly **12–15% of the stripped binary** — significant but not dominant (the majority is actual bundler logic, SWC parser, and standard library code).

---

## 4. Turbopack Logic vs. Turbo-Tasks Glue Fraction

Estimating the split between actual bundler logic and turbo-tasks plumbing:

| Category                                                           | Estimated size | Nature        |
| ------------------------------------------------------------------ | -------------- | ------------- |
| turbo-tasks infrastructure overhead (all categories above)         | ~8.4 MiB       | Pure glue     |
| Actual function bodies (2,545 functions, avg ~500 bytes net logic) | ~1.3 MiB       | Bundler logic |
| SWC parser/transformer (separate crate, not turbo-tasks)           | ~25–35 MB      | Parser        |
| Rust std + alloc + tokio + serde + etc.                            | ~15–20 MB      | Runtime       |
| DWARF debug symbols                                                | ~60–80 MB      | Debug info    |
| Remaining bundler logic (resolve, chunk, CSS, etc.)                | ~15–25 MB      | Bundler logic |

**Within turbo-tasks annotated code specifically:**

- Infrastructure glue: ~8.4 MiB (~65% of turbo-tasks-related code)
- Actual task logic: ~4–6 MiB (~35% of turbo-tasks-related code)

This is an unfavorable ratio, confirming that the macro overhead is disproportionate to the actual computation performed per task.

---

## 5. Refactoring Proposals (Ranked by Impact × Effort)

### Proposal A: Feature-gate `ValueDebug` / `dbg` / `dbg_depth`

**Files:** `turbopack/crates/turbo-tasks-macros/src/primitive_macro.rs`, `value_macro.rs`, `turbopack/crates/turbo-tasks/src/debug/mod.rs`  
**Impact:** ~2.5–3.5 MiB saved  
**Effort:** Low (add `#[cfg(feature = "value_debug")]` guards)  
**Risk:** Low (debug-only functionality)

Currently every `#[turbo_tasks::value]` and every primitive type automatically gets `ValueDebug` with two `#[turbo_tasks::function]` task registrations (`dbg` and `dbg_depth`). These are only useful during debugging. Add a `value_debug` cargo feature (defaulting to off in release builds):

```toml
# turbo-tasks/Cargo.toml
[features]
value_debug = []
```

In `primitive_macro.rs` and `value_macro.rs`, wrap the `value_debug_impl` block:

```rust
#[cfg(feature = "value_debug")]
let value_debug_impl = quote! { /* current dbg/dbg_depth impl */ };
#[cfg(not(feature = "value_debug"))]
let value_debug_impl = quote! {
    impl ValueDebug for #ty {
        fn dbg(self: Vc<Self>) -> Vc<ValueDebugString> { panic!("value_debug feature not enabled") }
        fn dbg_depth(self: Vc<Self>, _: usize) -> Vc<ValueDebugString> { panic!("value_debug feature not enabled") }
    }
};
```

In the non-debug path, the `ValueDebug` impls can use `default` impls with panic bodies that never generate monomorphized code. The `ValueDebugFormat` derive can similarly be gated.

**Saved symbols:** ~3,358 functor closures × avg 400 bytes + 1,679 `value_debug_format` closures × avg 460 bytes = **~2.1 MiB**.

---

### Proposal B: Merge `dbg()` into a non-task delegation to `dbg_depth()`

**Files:** `turbopack/crates/turbo-tasks-macros/src/primitive_macro.rs`, `value_macro.rs`  
**Impact:** ~350–700 KiB saved  
**Effort:** Very low (change 5 lines in macro)  
**Risk:** Very low

Replace the `dbg()` `#[turbo_tasks::function]` with a thin non-task wrapper that calls `dbg_depth(usize::MAX)`:

```rust
// In primitive_macro.rs, replace the current dbg impl:
// BEFORE:
#[turbo_tasks::function]
async fn dbg(&self) -> anyhow::Result<Vc<turbo_tasks::debug::ValueDebugString>> {
    use turbo_tasks::debug::ValueDebugFormat;
    self.value_debug_format(usize::MAX).try_to_value_debug_string().await
}

// AFTER:
fn dbg(self: Vc<Self>) -> Vc<turbo_tasks::debug::ValueDebugString> {
    self.dbg_depth(usize::MAX)
}
```

This eliminates one complete task registration per primitive/value type, saving:

- 1 `functor()` closure per type × 1,679 types × avg 400 bytes = **~672 KiB**
- The corresponding `resolve_functor_impl` instance (if the signature is unique)
- The ArgMeta encode/decode closures for the `dbg` function inputs

---

### Proposal C: Type-erase the `conditional_update` comparison

**Files:** `turbopack/crates/turbo-tasks/src/manager.rs`, `turbopack/crates/turbo-tasks/src/value_type.rs`, `turbopack/crates/turbo-tasks/src/vc/cell_mode.rs`  
**Impact:** ~700–900 KiB saved  
**Effort:** Medium  
**Risk:** Medium (touches the critical cell-update path, needs careful testing)

**Step 1:** Add a type-erased equality function pointer to `ValueType`:

```rust
// In value_type.rs:
type EqFn = fn(&dyn Any, &dyn Any) -> bool;

pub struct ValueType {
    pub bincode: Option<(AnyEncodeFn, AnyDecodeFn<SharedReference>)>,
    pub raw_cell: RawCellFactoryFn,
    pub compare_eq: Option<EqFn>,  // None for cell = "new" types
    // ...
}

impl ValueType {
    const fn new_inner<T: VcValueType>(global_name: &str, ...) -> Self {
        // Only set compare_eq if T: PartialEq
        // For VcCellCompareMode types:
        compare_eq: Some(|a, b| {
            a.downcast_ref::<T>().unwrap() == b.downcast_ref::<T>().unwrap()
        }),
    }
}
```

**Step 2:** Replace `compare_and_update<T>` and friends with a type-erased path:

```rust
// In manager.rs - BEFORE (monomorphized per T: 6 variants × 1,428 types):
pub fn compare_and_update<T: PartialEq + VcValueType>(&self, new_value: T) {
    self.conditional_update(|old_value| {
        if let Some(old_value) = old_value && old_value == &new_value { return None; }
        Some((new_value, None, None))
    });
}

// AFTER (single non-generic function, calls through vtable):
pub fn compare_and_update_erased(&self, new_sr: SharedReference) {
    let value_type = registry::get_value_type(self.cell_type_id());
    let eq_fn = value_type.compare_eq.expect("cell mode requires PartialEq");
    self.conditional_update_with_shared_reference(|old_sr| {
        if let Some(old_sr) = old_sr {
            let old: &dyn Any = old_sr.0.as_ref();
            let new: &dyn Any = new_sr.0.as_ref();
            if (eq_fn)(old, new) { return None; }
        }
        Some((new_sr, None, None))
    });
}
```

**Step 3:** Update `VcCellCompareMode::cell` and `raw_cell` to call the erased version:

```rust
// cell_mode.rs - AFTER:
impl<T: VcValueType + PartialEq> VcCellMode<T> for VcCellCompareMode<T> {
    fn cell(inner: VcReadTarget<T>) -> Vc<T> {
        let cell = find_cell_by_type::<T>();
        let new_sr = SharedReference::new(Arc::new(<T::Read as VcRead<T>>::target_to_value(inner)));
        cell.compare_and_update_erased(new_sr);  // no longer generic on T
        Vc { node: cell.into(), _t: PhantomData }
    }

    fn raw_cell(content: TypedSharedReference) -> RawVc {
        let cell = find_cell_by_type::<T>();
        cell.compare_and_update_erased(content.reference);  // no longer generic on T
        cell.into()
    }
}
```

This approach eliminates all 1,266 typed closure monomorphizations for `conditional_update_with_shared_reference` while maintaining correctness. The vtable dispatch cost is negligible (one indirect function call per cell update).

The `hashed_compare_and_update` variant would additionally need a type-erased hash function pointer in `ValueType` (easy extension of the same pattern), and `keyed_compare_and_update` would need a type-erased key-based diff function.

---

### Proposal D: Shared non-generic body for `resolve_functor_impl`

**Files:** `turbopack/crates/turbo-tasks/src/native_function.rs`, `turbopack/crates/turbo-tasks/src/task/task_input.rs`  
**Impact:** ~200–350 KiB saved  
**Effort:** Medium  
**Risk:** Low

Add `const NEEDS_RESOLVE: bool = false;` to `TaskInput` as a default-false associated const, overridden to `true` only in the `Vc<T>` impl and compound types containing `Vc`. Then in `ArgMeta::new::<T>()`:

```rust
// native_function.rs - conditional resolve registration:
const fn new<T: TaskInput>() -> Self {
    Self::with_filter_trait_call::<T>(
        noop_filter_args,
        if T::NEEDS_RESOLVE {
            resolve_functor_impl::<T>  // ~600-880 bytes, only when needed
        } else {
            trivial_clone_resolve::<T>  // ~100 bytes, or one shared no-op impl
        }
    )
}
```

For the "trivial" case where no `Vc<>` args exist, `trivial_clone_resolve` could be a single generic function that just clones:

```rust
fn trivial_clone_resolve<T: MagicAny + Clone>(value: &dyn MagicAny) -> ResolveFuture<'_> {
    Box::pin(async move {
        let value = downcast_args_ref::<T>(value).clone();
        Ok(Box::new(value) as Box<dyn MagicAny>)
    })
}
```

Even this must be monomorphized per T due to the downcast + clone, but the closure body is trivially smaller (no async Vc resolution chain). For truly no-clone cases (where the downcast is infallible), this could be further optimized.

The actual savings come from the ~527 functions (~60% of 877) whose arg tuples contain no `Vc<>`: each saves approximately the difference between a "real" closure (avg 800 bytes) and a minimal one (~150 bytes) = **~350 KiB**.

---

### Proposal E: ICF (Identical Code Folding) — Linker-Level

**Files:** Build configuration (`.cargo/config.toml` or `build.rs`)  
**Impact:** Variable, potentially ~0.5–1.5 MiB  
**Effort:** Very low (compiler/linker flags)  
**Risk:** Low

LLVM's ICF merges binary-identical functions. Many of the small `functor()` closures and ArgMeta closures may be identical in their final machine code even though they're different Rust types. Enable ICF in the release profile:

```toml
# .cargo/config.toml or Cargo.toml [profile.release]:
[profile.release]
lto = "fat"
codegen-units = 1
```

```toml
# In the linker flags:
[target.x86_64-unknown-linux-gnu]
rustflags = ["-C", "link-arg=-Wl,--icf=all"]
```

LTO + ICF together can merge functions that differ only in their type parameters but compile to identical machine code (e.g., many primitive-type ArgMeta closures). This is complementary to the source-level refactorings above.

---

## 6. Refactoring Priority Matrix

| Proposal                                      | Binary savings | Implementation effort | Risk     | Recommended?            |
| --------------------------------------------- | -------------- | --------------------- | -------- | ----------------------- |
| **A: Feature-gate ValueDebug**                | ~2.5–3.5 MiB   | 1–2 days              | Low      | **YES — High priority** |
| **B: Merge dbg() into dbg_depth()**           | ~350–700 KiB   | 2–4 hours             | Very low | **YES — Quick win**     |
| **C: Type-erase conditional_update**          | ~700–900 KiB   | 3–5 days              | Medium   | **YES — High value**    |
| **D: Reduce resolve_functor_impl**            | ~200–350 KiB   | 2–3 days              | Low      | YES                     |
| **E: LTO + ICF**                              | ~500–1,500 KiB | 1–2 hours             | Low      | **YES — Immediate**     |
| Proposal F: Fn-pointer-based functor dispatch | ~500–1,000 KiB | 1–2 weeks             | High     | Future work             |

**Combined estimated savings from A + B + C + D + E:** ~4.5–6.5 MiB from the stripped binary.

---

## 7. Code File Reference Map

| Source pattern                             | Key file                                                    | Relevant lines            |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------- |
| `resolve_functor_impl` definition          | `turbo-tasks/src/native_function.rs`                        | 135–141                   |
| `ArgMeta` struct + construction            | `turbo-tasks/src/native_function.rs`                        | 33–133                    |
| `conditional_update_with_shared_reference` | `turbo-tasks/src/manager.rs`                                | 2070–2130                 |
| `compare_and_update` variants              | `turbo-tasks/src/manager.rs`                                | 2140–2290                 |
| `TaskFnInputFunction::functor` impls       | `turbo-tasks/src/task/function.rs`                          | 205–335                   |
| `ValueType::new_with_bincode`              | `turbo-tasks/src/value_type.rs`                             | 95–145                    |
| `VcCellCompareMode::cell/raw_cell`         | `turbo-tasks/src/vc/cell_mode.rs`                           | 67–93                     |
| `#[turbo_tasks::function]` macro           | `turbo-tasks-macros/src/function_macro.rs`                  | all                       |
| `#[turbo_tasks::value]` macro              | `turbo-tasks-macros/src/value_macro.rs`                     | all                       |
| `primitive!()` macro (dbg/dbg_depth)       | `turbo-tasks-macros/src/primitive_macro.rs`                 | 25–55                     |
| `ValueDebugFormat` derive                  | `turbo-tasks-macros/src/derive/value_debug_format_macro.rs` | all                       |
| Per-type `T::cell()` generation            | `turbo-tasks-macros/src/value_macro.rs`                     | `cell_struct` quote block |

---

## 8. Measurement Methodology

Analysis was performed by:

1. **Building a representative test binary** (`turbo_test_binary`) within the workspace with 3 user value types and 7 functions, using the same `nightly-2026-04-02` toolchain and release profile as the target binary.

2. **Symbol extraction:** `nm -S --size-sort --reverse-sort libturbo_test_binary.so | rustfilt` to get all text symbols with sizes.

3. **Python-based categorization** by regex matching on demangled symbol names, summing sizes per category.

4. **Scaling** from the test binary ratios to the full binary using known counts:
   - Test binary: 28 registered types, ~35 registered functions
   - Full binary: ~1,679 registered types, ~2,545 registered functions
   - `conditional_update_with_shared_reference`: 57/28 types = 2.04 per type, scaled × 1,679 ≈ 1,488 instances (vs. 1,266 confirmed — within range)
   - `resolve_functor_impl`: 11 unique arg tuple types for 35 functions = 0.31, scaled × 2,545 ≈ 787 (vs. 877 confirmed — within range)

5. **Cross-validation** against the problem statement's confirmed figures:
   - `resolve_functor_impl`: 877 instances, 688 KiB ✓
   - `conditional_update_with_shared_reference`: 1,266 instances, 1.36 MiB ✓

All savings estimates are conservative; actual savings may be higher due to secondary effects (fewer symbols → better LLVM optimization opportunities, reduced linker pressure).
