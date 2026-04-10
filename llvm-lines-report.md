# LLVM IR Lines Analysis — next-napi-bindings

**Canary:** `9cf9a63264`
**Generated with:** `CARGO_PROFILE_RELEASE_LTO=fat cargo llvm-lines --release -p next-napi-bindings`

---

## 1. Executive Summary

| Metric                    | Value      |
| ------------------------- | ---------- |
| **Total IR lines**        | 19,584,111 |
| **Total function copies** | 366,016    |

The top 5 cost centers account for **~60% of all IR**:

| Category                            | IR Lines  | %     | Root Cause                                                                   |
| ----------------------------------- | --------- | ----- | ---------------------------------------------------------------------------- |
| `#[turbo_tasks::function]` wrappers | 2,399,952 | 12.2% | Per-function monomorphization of async state machine + arg resolution        |
| lightningcss                        | 2,339,335 | 11.9% | 350-variant `Property` enum with serde/parse/eq/clone × 2 deserializer types |
| serde (all)                         | 2,256,357 | 11.5% | Pervasive serialization across NAPI, bincode persistence, and JSON config    |
| SWC AST types                       | 2,214,702 | 11.3% | Deep recursive enums → massive drop/clone/hash/visit glue                    |
| `drop_in_place` (all)               | 1,312,884 | 6.7%  | Auto-generated recursive destructors, mainly SWC AST + lightningcss          |

---

## 2. Lines by Crate

| Crate                  | IR Lines  | %     | Fns    | Notes                         |
| ---------------------- | --------- | ----- | ------ | ----------------------------- |
| `turbo_tasks`          | 3,592,903 | 18.3% | 72,323 | Framework overhead dominates  |
| `lightningcss`         | 2,339,335 | 11.9% | —      | CSS parser/transformer        |
| `core`                 | 2,334,107 | 11.9% | —      | Rust stdlib (drop, iter, fmt) |
| `swc_ecma_ast`         | 2,214,702 | 11.3% | 51,378 | SWC JS/TS AST                 |
| `alloc`                | 1,321,554 | 6.7%  | —      | Box, Vec, String              |
| `next_core`            | 1,293,423 | 6.6%  | 19,326 | Next.js build logic           |
| `turbopack_ecmascript` | 1,103,876 | 5.6%  | 14,050 | JS module bundling            |
| `turbopack_core`       | 1,084,069 | 5.5%  | 17,152 | Bundler core                  |
| `hashbrown`            | 595,178   | 3.0%  | 9,764  | HashMap/HashSet internals     |
| `next_api`             | 329,031   | 1.7%  | —      | NAPI API layer                |
| `moxcms`               | 295,372   | 1.5%  | 3,311  | ICC color management          |
| `turbo_rcstr`          | 253,985   | 1.3%  | 5,400  | Reference-counted strings     |
| `turbo_bincode`        | 231,968   | 1.2%  | 3,958  | Custom bincode format         |
| `wast`                 | 223,270   | 1.1%  | 3,540  | WASM text format              |
| `wasmparser`           | 234,156   | 1.2%  | —      | WASM binary parser            |
| `image`                | 216,592   | 1.1%  | 2,556  | Image optimization            |
| `swc_ecma_visit`       | 208,164   | 1.1%  | 5,223  | Generated AST visitors        |
| `swc_ecma_minifier`    | 175,461   | 0.9%  | 1,732  | JS minification               |
| `swc_common`           | 177,589   | 0.9%  | 3,706  | SWC shared types              |
| `swc_atoms`            | 176,263   | 0.9%  | 3,469  | Interned strings              |
| `rustls`               | 156,765   | 0.8%  | 2,402  | TLS library                   |
| `indexmap`             | 155,421   | 0.8%  | —      | Ordered map                   |
| `pxfm`                 | 115,650   | 0.6%  | 356    | Special math (via `image`)    |
| `jiff`                 | 111,026   | 0.6%  | 852    | Date/time library             |

---

## 3. Derived Trait Costs (All Types Combined)

| Trait                    | IR Lines       | Fns     |
| ------------------------ | -------------- | ------- |
| `Deserialize`            | **1,682,960**  | 22,978+ |
| `Clone`                  | 210,353        | 2,010   |
| `PartialEq`              | 217,429        | —       |
| `Debug`                  | 185,588        | —       |
| `Serialize`              | 154,305        | —       |
| `Hash`                   | 46,376         | —       |
| **Total derived traits** | **~2,497,011** | —       |
| % of total               | **12.7%**      | —       |

---

## 4. Functional Category Breakdown

| Category                               | IR Lines      | %         | Count  |
| -------------------------------------- | ------------- | --------- | ------ |
| `turbo_tasks_function_inline` wrappers | **2,399,952** | **12.2%** | 27,087 |
| `bincode` Decode/Encode                | **772,830**   | **3.9%**  | 12,380 |
| `ValueDebugFormat` impls               | **413,730**   | **2.1%**  | 4,269  |
| `drop_in_place` (all)                  | **1,312,884** | **6.7%**  | 28,275 |
| `hashbrown` (HashMap ops)              | **595,178**   | **3.0%**  | 8,996  |
| `TaskInput::resolve_input`             | **65,042**    | **0.3%**  | 2,073  |
| `TraceRawVcs` impls                    | **30,603**    | **0.16%** | 2,268  |
| `__ctor` registration                  | **72,586**    | **0.4%**  | 795    |
| closures / async state machines        | **6,350,591** | **32.4%** | 79,624 |

---

## 5. Top 30 Largest Functions

| #   | Lines  | Copies  | Function                                               | Source                                                                            |
| --- | ------ | ------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | 19,815 | 28      | `drop_in_place::<Expr>`                                | `swc_ecma_ast/src/expr.rs:33` — 38-variant enum, auto-generated drop              |
| 2   | 18,646 | 1       | `BorderHandler::flush`                                 | `lightningcss/src/properties/border.rs:750` — `flush_category!` macro ×2          |
| 3   | 15,322 | 1       | `InjectHelpers::build_imports`                         | `swc_ecma_transforms_base/src/helpers/mod.rs:220` — `add_import_to!` ×105 helpers |
| 4   | 13,557 | 1       | `Property::deserialize::<ContentDeserializer>`         | `lightningcss/src/properties/mod.rs:989` — 347-arm match                          |
| 5   | 13,557 | 1       | `Property::deserialize::<serde_content::Deserializer>` | same, different `D` type param                                                    |
| 6   | 13,160 | 1       | `Property::parse`                                      | `lightningcss/src/properties/mod.rs:700` — 347-arm match                          |
| 7   | 12,101 | 1       | `handle_well_known_function_call`                      | `turbopack-ecmascript/src/references/mod.rs`                                      |
| 8   | 11,802 | 26      | `drop_in_place::<TsType>`                              | `swc_ecma_ast/src/typescript.rs:312` — 20-variant recursive enum                  |
| 9   | 11,788 | 1       | `FfdheGroup::named_group`                              | `rustls` — TLS 1.3 FFDHE group constants                                          |
| 10  | 11,357 | 1       | `CodeGen::code_generation`                             | `turbopack-ecmascript/src/code_gen.rs:207` — 23-variant match, each `.await`s     |
| 11  | 11,117 | 1       | `gaussian_blur_dyn_image`                              | `image/src/imageops/sample.rs` — per-pixel-format dispatch                        |
| 12  | 10,984 | 29      | `drop_in_place::<Stmt>`                                | `swc_ecma_ast/src/stmt.rs:39` — 19-variant enum                                   |
| 13  | 10,755 | 1       | `is_named_color`                                       | `swc_css_parser` — match over all CSS named colors                                |
| 14  | 10,370 | 1       | `ExperimentalConfig::decode`                           | `next-core/src/next_config.rs:1076` — 81 fields                                   |
| 15  | 10,102 | **451** | `wast::Instruction::encode::encode`                    | `wast/src/core/expr.rs` — ~600-variant enum, generic inner fn                     |
| 16  | 9,928  | 1       | `ExperimentalConfig::value_debug_format`               | `next-core/src/next_config.rs:1076` — 81 fields                                   |
| 17  | 9,783  | 1       | `AppEndpoint::output` (turbo_tasks fn)                 | `next-api/src/app.rs`                                                             |
| 18  | 9,197  | 1       | `NextConfig::decode`                                   | `next-core/src/next_config.rs:79` — 51 fields                                     |
| 19  | 9,192  | 1       | `get_server_module_options_context` (turbo_tasks fn)   | `next-core/src/next_server/context.rs`                                            |
| 20  | 8,939  | 1       | `Prefixer::visit_mut_declaration`                      | `swc_css_prefixer` — CSS vendor prefix injection                                  |
| 21  | 8,836  | 1       | `SystemJs::fold_module`                                | `swc_ecma_transforms_module` — SystemJS transform                                 |
| 22  | 8,813  | 1       | `jiff::Parser::parse`                                  | `jiff` — date/time format parsing                                                 |
| 23  | 8,560  | 1       | `Pure::visit_mut_expr`                                 | `swc_ecma_minifier` — expression-level optimizations                              |
| 24  | 8,484  | 1       | `ModuleOptions::new_internal` (turbo_tasks fn)         | `turbopack/src/module_options.rs`                                                 |
| 25  | 8,220  | 1       | `Feature::is_compatible`                               | `lightningcss` — browser compat check                                             |
| 26  | 8,118  | 1       | `VariantDecoder::decode_to_utf8_raw`                   | `encoding_rs` — all character encodings                                           |
| 27  | 8,023  | 1       | `analyze_ecmascript_module_internal::{closure#16}`     | `turbopack-ecmascript/src/references/mod.rs`                                      |
| 28  | 7,848  | 1       | `Analyzer::evaluate_immediate`                         | `turbopack-ecmascript/src/tree_shake/mod.rs`                                      |
| 29  | 7,726  | 1       | `ServerActions::visit_mut_module_items`                | `next-custom-transforms` — server actions transform                               |
| 30  | 7,532  | 2       | `make_chunk_group::<Either<Once, Copied>>`             | `turbopack-core/src/chunk/chunk_group.rs`                                         |

---

## 6. Deep Dive: `#[turbo_tasks::function]` — 2.4M Lines (12.2%)

### How the macro works

**Source:** `turbopack/crates/turbo-tasks-macros/src/func.rs:195` + `function_macro.rs:77`

For each `#[turbo_tasks::function] async fn foo(a: Vc<A>, b: B) -> Result<Vc<C>>`, the macro generates:

```rust
// 1. Public stub — calls dynamic_call()
pub fn foo(a: Vc<A>, b: B) -> Vc<C> { ... }

// 2. Actual implementation (renamed)
#[doc(hidden)]
async fn foo_turbo_tasks_function_inline(a: Vc<A>, b: B) -> Result<Vc<C>> {
    // original body
}

// 3. Static NativeFunction registration
turbo_tasks::macro_helpers::turbo_register!(
    FOO: NativeFunction = NativeFunction::new("foo", ..., &into_task_fn(foo_turbo_tasks_function_inline), ...)
);
```

### What gets monomorphized

**Source:** `turbopack/crates/turbo-tasks/src/task/function.rs:207`

`into_task_fn(F)` wraps `F` in `FunctionTaskFn<F, Mode, Inputs>`, which implements `TaskFn` via `TaskFnInputFunction::functor`. The `functor` method is defined at line 224 and creates an `async move {}` closure:

```rust
impl<F, Output, FutureOutput, $($arg,)*> TaskFnInputFunction<AsyncFunctionMode, ($($arg,)*)> for F
where
    // ... bounds ...
{
    fn functor(&self, arg: &dyn MagicAny) -> Result<NativeTaskFuture> {
        let ($($arg,)*) = downcast_args::<($($arg,)*)>(arg)?;
        let f = self.clone();
        Ok(Box::pin(async move {
            $(let $arg = $arg.resolve_input().await?;)*   // ← per-arg resolve
            let output = f($($arg,)*).await?;             // ← call user fn
            output.cell()                                 // ← store result
        }))
    }
}
```

This is instantiated **13 times** (0–12 args) via `task_fn_impl!` at lines 337–348, and each real function matches exactly one `(F, Mode, Inputs)` triple.

### Per-function IR overhead

Each `#[turbo_tasks::function]` generates **4–6 IR entries**:

| Entry                                        | Avg IR Lines | What                                                   |
| -------------------------------------------- | ------------ | ------------------------------------------------------ |
| `functor::{closure#0}` (async state machine) | ~194         | The `async move {}` with `resolve_input()` + user body |
| `functor` (outer)                            | ~38          | `downcast_args` + `Box::pin`                           |
| `drop_in_place::<closure#0>`                 | ~54          | Destructor for the state machine                       |
| `FunctionTaskFn::functor` (vtable shim)      | ~29          | Thin dispatch to `TaskFnInputFunction::functor`        |
| Total per function                           | **~315**     | Varies widely: 197 (simple) → 3,798 (complex)          |

### Examples (from IR data cross-referenced with source)

**Simple case — 1 arg, sync:**
`EvaluatableAssets::one` → 197 total IR lines (96 + 55 + 44 + 2)

**Complex case — 5 args, async:**
`url_resolve(Vc<ResolveOrigin>, Vc<Request>, ReferenceType, Option<IssueSource>, ResolveErrorMode)` → 3,798 total IR lines. The `ReferenceType` arg alone has a `resolve_input` that recurses through a large enum (3,503 lines).

**Biggest wrappers by IR size:**

| Lines | Function                            | Source                                             |
| ----- | ----------------------------------- | -------------------------------------------------- |
| 9,783 | `AppEndpoint::output`               | `crates/next-api/src/app.rs`                       |
| 9,192 | `get_server_module_options_context` | `crates/next-core/src/next_server/context.rs`      |
| 8,484 | `ModuleOptions::new_internal`       | `turbopack/crates/turbopack/src/module_options.rs` |
| 4,765 | `PageEndpoint::output`              | `crates/next-api/src/pages.rs`                     |
| 4,556 | `create_page_ssr_entry_module`      | `crates/next-core/src/next_pages/page_entry.rs`    |

---

## 7. Deep Dive: lightningcss — 2.34M Lines (11.9%)

### `Property` enum — 350 variants

**Source:** `lightningcss/src/properties/mod.rs:684` (generated by `define_properties!` macro at lines 1202–1620)

```rust
define_properties! {
    "background-color": BackgroundColor(CssColor),
    "background-image": BackgroundImage(SmallVec<[Image<'i>; 1]>),
    // ... 345 more CSS properties ...
    "color-scheme": ColorScheme(ColorScheme),
}
// + All, Unparsed, Custom = 350 total variants
```

Every trait impl on `Property` generates a **350-arm match**. These are the individual costs:

| Function                           | Lines  | Copies | How Generated                                                                                    |
| ---------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------ |
| `Property::parse`                  | 13,160 | 1      | Inside `define_properties!` at line 700 — 347-arm match calling `<T>::parse_with_options(input)` |
| `Property::deserialize`            | 13,557 | 1      | Manual `impl Deserialize` inside `define_properties!` at line 989 — 347-arm match                |
| `Property::deserialize` (2nd)      | 13,557 | 1      | Same code, monomorphized for `serde_content::de::Deserializer`                                   |
| `Property::serialize::<napi::Ser>` | 5,520  | 1      | For NAPI bridge                                                                                  |
| `Property::eq`                     | 4,871  | 1      | 350-arm `PartialEq`                                                                              |
| `Property::eq` (LTO clones)        | 4,861  | 2      | LTO failed to merge with canonical copy                                                          |
| `Property::clone`                  | 3,694  | 1      | 350-arm `Clone`                                                                                  |
| `Property::clone` (LTO clones)     | 3,519  | 3      | Same code, LTO duplicates                                                                        |
| `Property::debug`                  | 2,559  | 1      | 350-arm `Debug::fmt`                                                                             |
| `drop_in_place::<Property>`        | 3,943  | 4      | Auto-generated destructor                                                                        |

**Total `Property` enum alone: ~73,000 lines** — 0.37% of the entire binary from a single enum.

### `BorderHandler::flush` — 18,646 lines

**Source:** `lightningcss/src/properties/border.rs:750–1294` (545 lines of Rust)

The source is "only" 545 lines, but it defines two local macros (`prop!`, `flush_category!`) that expand combinatorially. `flush_category!` handles the full cross-product of:

- 4 sides (top/right/bottom/left or block-start/block-end/inline-start/inline-end)
- 3 sub-properties per side (width, style, color)
- Shorthand collapsing logic (2-value, 3-value, 4-value syntax)
- Vendor prefix fallback generation
- Physical ↔ logical property conversion

It is **invoked twice**: once for physical borders, once for logical borders. The resulting macro expansion is enormous.

### Other `flush` handlers (same pattern, smaller):

| Handler                             | Source                                         | Lines |
| ----------------------------------- | ---------------------------------------------- | ----- |
| `SizeHandler::flush`                | `lightningcss/src/properties/size.rs:485`      | 6,896 |
| `MaskHandler::handle_property`      | `lightningcss/src/properties/masking.rs:762`   | 5,405 |
| `AnimationHandler::handle_property` | `lightningcss/src/properties/animation.rs:887` | 4,090 |

---

## 8. Deep Dive: SWC AST `drop_in_place` — 168K Lines

### The types

| Enum           | Source                               | Variants | Lines       | Copies    | Manual Drop? |
| -------------- | ------------------------------------ | -------- | ----------- | --------- | ------------ |
| `Expr`         | `swc_ecma_ast/src/expr.rs:33`        | **38**   | 19,815      | 28        | No           |
| `TsType`       | `swc_ecma_ast/src/typescript.rs:312` | **20**   | 11,802      | 26        | No           |
| `Stmt`         | `swc_ecma_ast/src/stmt.rs:39`        | **19**   | 10,984      | 29        | No           |
| `Decl`         | `swc_ecma_ast/src/decl.rs`           | —        | 5,270       | 26        | No           |
| `AssignTarget` | `swc_ecma_ast/src/expr.rs`           | —        | 3,529       | 26        | No           |
| `Prop`         | `swc_ecma_ast/src/prop.rs`           | —        | 3,257       | 21        | No           |
| `ModuleItem`   | `swc_ecma_ast/src/module.rs`         | —        | 3,099       | 26        | No           |
| `Box<Expr>`    | (wrapper)                            | —        | 2,790       | 31        | No           |
| **Total**      |                                      |          | **168,337** | **4,049** |              |

**None of these have manual `Drop` impls.** Confirmed by `grep -rn "impl Drop for Expr\|Stmt\|TsType"` across all SWC source — zero matches. The only nearby manual Drop in SWC is `swc_ecma_minifier`'s `SynthesizedStmts`.

### Why the drop glue is so large

`Expr` is recursive: `Expr` → `BinExpr { left: Box<Expr>, right: Box<Expr> }` → `Expr` → ...

The auto-generated `drop_in_place::<Expr>` becomes a 38-arm match where many arms recursively call `drop_in_place::<Box<Expr>>` → `drop_in_place::<Expr>`. LLVM inlines this chain at each call site, producing 19,815 IR lines per copy × 28 copies. The chain also pulls in `Stmt` drop (via `ExprStmt`) and `TsType` drop (via `TsAsExpr`), creating a mutual recursion of drop glue.

---

## 9. Deep Dive: `ExperimentalConfig` / `NextConfig` — 35K Lines for 4 Functions

### `ExperimentalConfig` — 81 fields

**Source:** `crates/next-core/src/next_config.rs:1062–1205`

```rust
#[derive(Clone, Debug, Default, PartialEq, Deserialize,
         TraceRawVcs, ValueDebugFormat, NonLocalValue, OperationValue,
         Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalConfig {
    pub allowed_revalidate_header_keys: Option<Vec<RcStr>>,
    pub client_router_filter: Option<bool>,
    // ... 79 more fields ...
    pub lightning_css_features: Option<bool>,
}
```

Derives include `Encode`, `Decode`, and `ValueDebugFormat` **explicitly in the source** (lines 1062–1074). It is NOT annotated with `#[turbo_tasks::value]`.

### `NextConfig` — 51 fields + embeds `ExperimentalConfig`

**Source:** `crates/next-core/src/next_config.rs:76–170`

```rust
#[turbo_tasks::value(eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NextConfig {
    pub config_file: Option<RcStr>,
    // ... 49 more fields ...
    pub experimental: ExperimentalConfig,   // ← embeds 81 more fields!
}
```

The `#[turbo_tasks::value(eq = "manual")]` macro **automatically injects** `Encode`, `Decode`, and `ValueDebugFormat` (via `turbo-tasks-macros/src/value_macro.rs:357`). The `eq = "manual"` only skips deriving `PartialEq` — serialization mode defaults to `Auto`, so bincode derives are always added.

### Generated function sizes

| Function                                 | Lines      | Cause                                                           |
| ---------------------------------------- | ---------- | --------------------------------------------------------------- |
| `ExperimentalConfig::decode` (bincode)   | **10,370** | Sequential decode of 81 fields, each with type-specific decoder |
| `ExperimentalConfig::value_debug_format` | **9,928**  | Async debug-format of 81 fields, each field `.await`ed          |
| `NextConfig::decode`                     | **9,197**  | 51 fields, one of which calls `ExperimentalConfig::decode`      |
| `NextConfig::value_debug_format`         | **5,286**  | 51 fields debug formatting                                      |
| `ExperimentalConfig::eq`                 | **933**    | Field-by-field comparison × 81                                  |
| **Total**                                | **35,714** |                                                                 |

---

## 10. Deep Dive: `wast::Instruction::encode` — 451 Copies

### Source

**Source:** `~/.cargo/registry/src/.../wast-235.0.0/src/core/expr.rs`

The `Instruction` enum has **~600 variants** (one per WebAssembly opcode). The `Encode` trait impl generates:

```rust
impl Encode for Instruction<'_> {
    fn encode(&self, e: &mut Vec<u8>) {
        fn encode(inst: &Instruction, e: &mut Vec<u8>) {  // ← inner fn, generic
            match inst {
                Instruction::Block { .. } => { ... }
                Instruction::Loop { .. } => { ... }
                // ... ~600 more arms
            }
        }
        encode(self, e)
    }
}
```

The inner `encode` function gets **451 copies** because it's a large non-inlineable function that LLVM clones at call sites during fat LTO optimization.

### Dependency chain

```
wast ← wat ← turbopack-wasm ← next-api / turbopack ← next-napi-bindings
```

**`turbopack-wasm`** provides WebAssembly module support for Turbopack. The `wast` crate is used to parse `.wat` text format files and re-encode them.

**Total WASM support cost:** `wast` (223,270) + `wasmparser` (234,156) = **457,426 lines (2.3%)**.

---

## 11. Deep Dive: Image Processing Chain — 627K Lines (3.2%)

### Dependency chain

```
pxfm ← moxcms ← image ← turbopack-image ← next-core ← next-napi-bindings
```

| Crate     | Lines       | What                                                     |
| --------- | ----------- | -------------------------------------------------------- |
| `image`   | 216,592     | Core image decoding/encoding/resizing                    |
| `moxcms`  | 295,372     | ICC color profile management                             |
| `pxfm`    | 115,650     | Special math: gamma, digamma, trigamma, Bessel functions |
| **Total** | **627,614** |                                                          |

### Largest functions

| Lines    | Function                                | Why                                                                                                           |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 11,117   | `gaussian_blur_dyn_image`               | Per-pixel-format dispatch (`DynamicImage` has ~20 variants × blur kernel)                                     |
| 2,912 ×3 | `moxcms::do_any_to_any::<T, N, L, S>`   | LUT-based color conversion, monomorphized for `<u8,8,256,4096>`, `<f64,1,65536,65536>`, `<f32,1,65536,32768>` |
| 2,381 ×3 | `moxcms::make_lut_transform::<T,N,L,S>` | Same — multiple LUT size monomorphizations                                                                    |

### Feature flags

`turbopack-image/Cargo.toml` already uses `default-features = false` with only:

```toml
image = { workspace = true, default-features = false, features = [
  "gif", "png", "jpeg", "ico", "bmp", "tga",
] }
```

However, `moxcms` and `pxfm` are **transitive dependencies** of the enabled decoders (color management is needed for PNG/JPEG ICC profiles). They cannot be eliminated without removing format support.

---

## 12. Deep Dive: Other Surprising Dependencies

### `encoding_rs` — ~20K lines

```
encoding_rs ← allsorts ← next-core
```

`allsorts` is a font shaping library. It needs `encoding_rs` because font metadata can use legacy character encodings. The `VariantDecoder::decode_to_utf8_raw` function (8,118 lines) is a giant match over ~40 character encoding variants.

### `jiff` — 111K lines

```
jiff ← turbo-persistence ← turbo-tasks-backend ← next-napi-bindings
```

Used for timestamp handling in the turbo-tasks persistence layer. `jiff::Parser::parse` (8,813 lines — #22 largest function) is a comprehensive date/time format parser.

### `rustls` — 157K lines

```
rustls ← hyper-rustls ← reqwest ← turbo-tasks-fetch ← next-core
```

TLS for HTTPS fetching in the dev server. `FfdheGroup::named_group` (11,788 lines — #9 largest) is a match over all FFDHE groups for TLS 1.3.

---

## 13. Deep Dive: turbopack-ecmascript Hotspots

Cross-referencing IR data with source:

### `CodeGen::code_generation` — 11,357 lines

**Source:** `turbopack/crates/turbopack-ecmascript/src/code_gen.rs:180–207`

```rust
pub enum CodeGen {  // 23 variants
    AmdDefineWithDependenciesCodeGen(Box<AmdDefineWithDependenciesCodeGen>),
    CjsRequireCacheAccess(CjsRequireCacheAccess),
    ConstantConditionCodeGen(ConstantConditionCodeGen),
    // ... 20 more variants ...
}

impl CodeGen {
    pub async fn code_generation(&self, ctx: ..., ...) -> Result<CodeGeneration> {
        match self {
            CodeGen::AmdDefineWithDependenciesCodeGen(v) => v.code_generation(ctx, ...).await,
            CodeGen::CjsRequireCacheAccess(v) => v.code_generation(ctx, ...).await,
            // ... 21 more arms, each .await-ing
        }
    }
}
```

Each `.await` creates a separate async state machine arm. With `opt-level = 3` on turbopack-ecmascript, LLVM inlines all 23 variant implementations into this single function.

### `handle_well_known_function_call` — 12,101 lines

**Source:** `turbopack/crates/turbopack-ecmascript/src/references/mod.rs`

Handles special-case analysis of known APIs (`require.resolve`, `__dirname`, `process.env`, `URL`, `path.join`, etc.). Each well-known function has unique analysis logic that gets monomorphized through a generic closure chain.

### Tree-shake analysis functions

| Lines | Function                       | Source                                         |
| ----- | ------------------------------ | ---------------------------------------------- |
| 7,848 | `Analyzer::evaluate_immediate` | `turbopack-ecmascript/src/tree_shake/mod.rs`   |
| 7,094 | `DepGraph::init`               | `turbopack-ecmascript/src/tree_shake/graph.rs` |
| 5,195 | `DepGraph::split_module`       | `turbopack-ecmascript/src/tree_shake/graph.rs` |
| 3,886 | `Analyzer::analyze`            | `turbopack-ecmascript/src/tree_shake/mod.rs`   |
| 3,416 | `DepGraph::finalize`           | `turbopack-ecmascript/src/tree_shake/graph.rs` |

### SWC AST visitor monomorphizations

Each Turbopack visitor type gets a **full monomorphization** of `visit_children_with_ast_path` for every AST node type:

| Lines | Visitor → Node                     |
| ----- | ---------------------------------- |
| 3,281 | `ModuleReferencesVisitor` → `Expr` |
| 3,235 | `Analyzer` → `Expr`                |
| 831   | `IdentUsageCollector` → `Expr`     |
| 710   | `ShouldSkip` → `Expr`              |

---

## 14. Serde Deserialize Monomorphizations

Serde generates **separate code for each `D: Deserializer` type**. The binary contains at least 14 distinct deserializer types:

| Deserializer Type                                       | IR Lines      | Fns        | Why                                   |
| ------------------------------------------------------- | ------------- | ---------- | ------------------------------------- |
| `ContentDeserializer<serde_content::Error>`             | 261,595       | 3,021      | lightningcss buffered deserialization |
| `serde_json::StrRead`                                   | 55,327        | 366        | JSON string parsing                   |
| `serde_json::SliceRead`                                 | 41,850        | 369        | JSON byte slice parsing               |
| `serde_json::IoRead<BufReader<StripHeaderReader<...>>>` | 8,480 ×3      | 54 ×3      | Source map parsing (3 reader types)   |
| `napi::Error`                                           | 65,300        | 938        | NAPI JavaScript ↔ Rust bridge        |
| `bincode::DecodeError`                                  | 18,027        | 110        | turbo-tasks persistence               |
| `bincode::DecoderImpl<TurboBincodeReader>`              | 16,473        | 76         | Same, direct decoder path             |
| `napi::De`                                              | 7,646         | 207        | NAPI direct deserialization           |
| Other/mixed                                             | 768,863       | 13,925     | —                                     |
| **Total**                                               | **1,682,960** | **22,978** |                                       |

---

## 15. `__ctor` Registration — 72,586 Lines

Every `#[turbo_tasks::value]` and `#[turbo_tasks::function]` registers a static constructor at link time:

| Module                     | Lines | Copies  | Registered Items                        |
| -------------------------- | ----- | ------- | --------------------------------------- |
| `next_core::next_config`   | 2,016 | **224** | 224 types/functions in `next_config.rs` |
| `turbo_tasks::primitives`  | 1,872 | **208** | 208 primitive type registrations        |
| `turbo_tasks_fs`           | 1,125 | **125** | 125 fs-related items                    |
| `turbopack_core::resolve`  | 1,071 | **119** | 119 resolve-related items               |
| `next_api::project`        | 1,026 | **114** | 114 project API items                   |
| `next_core::app_structure` | 945   | **105** | 105 app router items                    |

---

## 16. Monomorphization Hotspots (Most Copies)

| Copies  | Lines  | Function                            | Why                              |
| ------- | ------ | ----------------------------------- | -------------------------------- |
| **451** | 10,102 | `wast::Instruction::encode::encode` | ~600-variant enum, LTO cloning   |
| **224** | 2,016  | `next_core::next_config::__ctor`    | 224 registered turbo-tasks items |
| **208** | 1,872  | `turbo_tasks::primitives::__ctor`   | 208 registered primitive items   |
| **156** | 1,333  | `drop_in_place::<String>`           | Ubiquitous string drops          |
| **125** | 1,125  | `turbo_tasks_fs::__ctor`            | 125 registered fs items          |
| **117** | 1,053  | `drop_in_place::<Vec<u8>>`          | Ubiquitous byte buffer drops     |
| **29**  | 10,984 | `drop_in_place::<Stmt>`             | SWC AST per-CGU copies           |
| **28**  | 19,815 | `drop_in_place::<Expr>`             | SWC AST per-CGU copies           |
| **26**  | 11,802 | `drop_in_place::<TsType>`           | SWC AST per-CGU copies           |

---

## 17. Optimization Opportunities

### Tier 1: High Impact (>100K IR lines potential savings)

#### A. Type-erase `turbo_tasks::function` argument resolvers

**Current:** Each function's `(A, B, C)` tuple type creates a unique `TaskFnInputFunction` monomorphization.
**Source:** `turbopack/crates/turbo-tasks/src/task/function.rs:224`
**Fix:** Box individual `resolve_input` futures into `Vec<Pin<Box<dyn Future>>>` instead of monomorphizing per-tuple. Each wrapper shrinks from ~315 to ~50 lines.
**Est. savings:** ~1–1.5M lines

#### B. Reduce serde Deserializer monomorphizations

**Current:** 14 distinct deserializer types × all deserialized types = massive code duplication.
**Fix:** For `swc_sourcemap`'s 3 IoRead variants (`RopeReader`, `File`, `&[u8]`), use `Box<dyn BufRead>` to collapse 3 deserializer monomorphizations to 1. For lightningcss, investigate if `ContentDeserializer` can share code with `serde_content::Deserializer`.
**Est. savings:** ~50–100K lines

### Tier 2: Medium Impact (10K–100K lines)

#### C. Iterative `Drop` on SWC `Expr`/`Stmt`/`TsType` (upstream)

**Source:** `swc_ecma_ast/src/expr.rs:33`, `stmt.rs:39`, `typescript.rs:312`
**Fix:** Implement `Drop for Expr` using an explicit work-stack instead of recursion. This makes the drop non-recursive, preventing LLVM from usefully inlining it further. Collapses 28 copies × 19,815 lines → 1 copy × ~2,000 lines.
**Est. savings:** ~80–120K lines
**Requires:** Upstream SWC change

#### D. Split `ExperimentalConfig` into sub-structs

**Source:** `crates/next-core/src/next_config.rs:1076` — 81 fields
**Fix:** Group fields into `ExperimentalCacheConfig`, `ExperimentalTurbopackConfig`, etc. (15 `turbopack_*` fields alone). Each sub-struct gets smaller derived functions.
**Est. savings:** ~20–30K lines for the top 4 functions

#### E. Make `wast::Instruction::encode` non-generic (upstream)

**Source:** `wast/src/core/expr.rs`
**Fix:** Change inner `encode` to write to `&mut Vec<u8>` directly instead of being generic. Eliminates 451 copies → 1.
**Est. savings:** ~9,900 lines
**Requires:** Upstream `wast` crate change

#### F. `#[inline(never)]` on `lightningcss::Property` trait impls (upstream)

**Current:** `Property::clone` has 4 copies (13,255 lines), `Property::eq` has 4 copies (17,008 lines) — LTO failed to merge them.
**Fix:** Add `#[inline(never)]` to `clone`, `eq`, `fmt::Debug` on `Property`.
**Est. savings:** ~20K lines
**Requires:** Upstream lightningcss change

### Tier 3: Low Impact (<10K lines) or Architectural

#### G. Move image optimization to separate process

**Current:** `image` + `moxcms` + `pxfm` = 627K lines statically linked.
**Fix:** Move image optimization to a Node.js child process or separate native addon.
**Est. savings:** ~627K lines
**Difficulty:** Major architectural change

#### H. Feature-gate `turbopack-wasm`

**Current:** `wast` + `wasmparser` = 457K lines, always linked.
**Fix:** Put `turbopack-wasm` behind a cargo feature flag on `next-api`, only enable when WASM module support is needed.
**Est. savings:** ~457K lines (when disabled)

#### I. Lazy-load `allsorts` (font shaping)

**Current:** `allsorts` pulls in `encoding_rs` (~20K+ lines) for legacy font metadata encoding support.
**Fix:** If `allsorts` can be made optional or lazy-loaded, removes `encoding_rs` and font shaping code.

---

## 18. Summary Table

```
Total IR lines:                    19,584,111  (100%)

By functional role:
  turbo_tasks framework overhead:
    _turbo_tasks_function_inline:   2,399,952  (12.2%)  ← #1 lever
    bincode Decode/Encode:            772,830  ( 3.9%)
    ValueDebugFormat:                 413,730  ( 2.1%)
    TaskInput::resolve_input:          65,042  ( 0.3%)
    TraceRawVcs:                       30,603  ( 0.2%)
    __ctor boilerplate:                72,586  ( 0.4%)
    SUBTOTAL framework:             3,754,743  (19.2%)

  Derived trait impls:
    Deserialize:                    1,682,960  ( 8.6%)
    PartialEq:                        217,429  ( 1.1%)
    Clone:                            210,353  ( 1.1%)
    Debug:                            185,588  ( 0.9%)
    Serialize:                        154,305  ( 0.8%)
    Hash:                              46,376  ( 0.2%)
    SUBTOTAL derived:               2,497,011  (12.7%)

  drop_in_place (all):              1,312,884  ( 6.7%)
    swc_ecma_ast drops:               168,337  ( 0.9%)
    lightningcss drops:                ~4,000  ( 0.0%)

By library:
  lightningcss (CSS):               2,339,335  (11.9%)
  SWC (all crates):                 4,614,577  (23.6%)
  image + moxcms + pxfm:             627,614  ( 3.2%)
  wast + wasmparser (WASM):           457,426  ( 2.3%)
  rustls (TLS):                       156,765  ( 0.8%)
  jiff (time):                        111,026  ( 0.6%)
  encoding_rs:                        ~20,000  ( 0.1%)
```

---

## 19. Deep Dive: SWC Visitor System — 2.1M Lines (10.8%)

The SWC visitor system (`swc_ecma_visit`) is a code-generated trait framework. For **221 distinct AST node types** and **22 distinct visitor crate namespaces**, it generates `visit_children_with` / `visit_children_with_ast_path` / `visit_mut_children_with` / `fold_children_with` methods.

| Category                               | IR Lines      | Functions |
| -------------------------------------- | ------------- | --------- |
| All `swc_ecma_visit` references        | **2,113,042** | 52,304    |
| `VisitMut` / `visit_mut_children_with` | **1,156,404** | 31,102    |
| `AstParentKind` (path tracking type)   | **15,887**    | 102       |

### Largest SWC visitor functions

| Lines | Visitor                                                         | Method                      |
| ----- | --------------------------------------------------------------- | --------------------------- |
| 8,939 | `swc_css_prefixer::Prefixer`                                    | `visit_mut_declaration`     |
| 8,836 | `swc_ecma_transforms_module::SystemJs`                          | `fold_module`               |
| 8,560 | `swc_ecma_minifier::Pure`                                       | `visit_mut_expr`            |
| 7,726 | `next_custom_transforms::ServerActions<SwcComments>`            | `visit_mut_module_items`    |
| 7,394 | `next_custom_transforms::ServerActions<SingleThreadedComments>` | `visit_mut_module_items`    |
| 4,757 | `swc_ecma_visit::NodeRef`                                       | `experimental_raw_children` |
| 4,515 | `swc_ecma_minifier::Optimizer`                                  | `visit_mut_expr`            |
| 4,215 | `DecoratorPass`                                                 | `visit_mut_class_members`   |
| 3,775 | `swc_ecma_minifier::Pure`                                       | `visit_mut_stmt`            |
| 3,281 | `Expr::visit_children_with_ast_path<ModuleReferencesVisitor>`   | (turbopack analysis)        |
| 3,235 | `Expr::visit_children_with_ast_path<Analyzer>`                  | (turbopack analysis)        |

### `ServerActions` duplication — 15,120 lines for 2 comment type variants

**Source:** `crates/next-custom-transforms/src/transforms/server_actions.rs`

`ServerActions<C: Comments>` is generic over the comment provider. It gets instantiated for **both** `SwcComments` (7,726 lines) and `SingleThreadedComments` (7,394 lines). The visitor trait (`VisitMut`) is monomorphized per concrete type, duplicating the entire 7K+ line visitor for a difference in how comments are read. Total cost: **15,120 lines**.

### SWC transform crate costs

| Crate                              | IR Lines     | Functions   |
| ---------------------------------- | ------------ | ----------- |
| `swc_ecma_transforms_base`         | 233,278      | 4,086       |
| `swc_ecma_transforms_optimization` | 128,368      | 2,568       |
| `swc_ecma_transforms_module`       | 109,147      | 2,374       |
| `swc_ecma_transforms_proposal`     | 103,651      | 2,881       |
| `swc_ecma_transforms_react`        | 81,754       | 1,418       |
| `swc_ecma_transforms_typescript`   | 54,780       | 989         |
| `swc_ecma_compat_es2015`           | —            | —           |
| **Total SWC transforms**           | **~711,000** | **~14,000** |

### `next_custom_transforms` — 435,013 lines (2.2%)

Next.js custom SWC transforms (server actions, RSC validation, barrel optimization, etc.):

| Lines | Transform                                                       |
| ----- | --------------------------------------------------------------- |
| 7,726 | `ServerActions<SwcComments>::visit_mut_module_items`            |
| 7,394 | `ServerActions<SingleThreadedComments>::visit_mut_module_items` |
| 2,944 | `TransformOptions::deserialize::visit_map`                      |
| 2,335 | `OptimizeBarrel::fold_module_items`                             |
| 1,808 | `custom_before_pass::<SingleThreadedComments>`                  |
| 1,784 | `ReactServerComponentValidator::visit_module`                   |
| 1,600 | `DebugInstantStack::visit_mut_module_items`                     |

### `AstParentKind` — 15,887 lines

`AstParentKind` is a large enum tracking the path from root to current node during AST traversal. It has derived `PartialEq`, `PartialOrd`, `Debug`, `Serialize`, `Deserialize` — all generating big match statements:

| Lines | Derived Trait                           |
| ----- | --------------------------------------- |
| 4,479 | `Deserialize::visit_enum` (via bincode) |
| 2,067 | `PartialOrd::partial_cmp`               |
| 1,753 | `PartialEq::eq`                         |
| 1,658 | `Debug::fmt`                            |
| 959   | `Deserialize::visit_u64`                |
| 713   | `Serialize::serialize` (bincode)        |

---

## 20. Deep Dive: Async Runtime — tokio + futures_util = 1.45M Lines

| Crate          | IR Lines      | Functions  |
| -------------- | ------------- | ---------- |
| `tokio`        | 699,290       | 22,315     |
| `futures_util` | 746,092       | 18,321     |
| **Total**      | **1,445,382** | **40,636** |

### `FuturesUnordered` — 304,247 lines (1.6%)

`FuturesUnordered` is heavily used in Turbopack for concurrent task execution. Each use site with a different `Future` type creates a new `poll_next` monomorphization:

| Lines  | Copies | Future Type                                                |
| ------ | ------ | ---------------------------------------------------------- |
| 698    | 1      | `Effects::apply::{closure#0}`                              |
| 608 ×3 | 2 each | `make_chunk_group` variants                                |
| 514 ×2 | 2 each | `ToResolvedVcFuture<ModuleBatchGroup/ChunkItemBatchGroup>` |
| 512    | 2      | `chunk_group_content` closure                              |

Total: **304,247 lines** across **7,515 functions** from `FuturesUnordered` and related types.

### `JoinAll` — used by `ValueDebugFormat`

The largest `JoinAll` instances come from `ValueDebugFormat`'s async field formatting:

- `drop_in_place<JoinAll<AsyncFormattingField::resolve>>`: 2,060 lines × 21 copies
- `drop_in_place<JoinAll<value_debug_format_field>>`: 1,085 lines × 12 copies

---

## 21. Deep Dive: hashbrown — 595,178 Lines (3.0%)

**1,353 unique `reserve_rehash` monomorphizations** — one per distinct `HashMap<K,V>` type in the binary.

### hashbrown by operation

| Operation                | IR Lines | Functions |
| ------------------------ | -------- | --------- |
| `reserve_rehash`         | 208,986  | 1,353     |
| other                    | 120,106  | 2,516     |
| `drop` (ScopeGuard etc.) | 92,621   | 2,559     |
| `iter` (fold_impl etc.)  | 76,453   | 1,491     |
| `insert`                 | 62,257   | 479       |
| `find`                   | 13,244   | 289       |
| `clone`                  | 10,921   | 205       |
| `rustc_entry`            | 10,590   | 104       |

### Top HashMap key types (by function count)

| Count | Key Type                      |
| ----- | ----------------------------- |
| 976   | `TaskId`                      |
| 350   | `Arc<CachedTaskType>`         |
| 283   | `String`                      |
| 255   | `ValueTypeId`                 |
| 236   | `(Atom, SyntaxContext)`       |
| 214   | `Atom`                        |
| 106   | `ResolvedVc<Box<dyn Module>>` |
| 104   | `RcStr`                       |

---

## 22. Deep Dive: NAPI Bridge — 835,092 Lines (4.3%)

The NAPI bridge layer connects Turbopack to Node.js:

| Crate                      | IR Lines | Functions |
| -------------------------- | -------- | --------- |
| `napi` (framework)         | 835,092  | 18,927    |
| `next_napi_bindings` (app) | 649,731  | 18,540    |

### Top NAPI functions

| Lines | Function                                                            |
| ----- | ------------------------------------------------------------------- |
| 5,520 | `Property::serialize::<napi::Ser>` — lightningcss→JS bridge         |
| 4,415 | `Options::build_as_input` — SWC transform pipeline monomorphization |
| 3,333 | `Property::visit_children<JsVisitor>` — lightningcss NAPI visitor   |
| 2,897 | `LengthValue::serialize::<napi::Ser>`                               |
| 2,690 | `CssRuleList<AtRule>::minify` — NAPI-specific CSS minification      |
| 2,620 | `NapiProjectOptions::from_napi_value` — project options parsing     |

### `NapiProjectOptions::from_napi_value` — 2,620 lines

**Source:** `crates/next-napi-bindings/src/next_api/project.rs`

This is the entry point for converting JavaScript project options into Rust structs. The `FromNapiValue` derive generates a sequential field-by-field extraction from the JavaScript object, similar to how bincode `Decode` works for `ExperimentalConfig`.

---

## 23. Deep Dive: turbo-tasks Backend & Persistence — 651K Lines

| Crate                 | IR Lines | Functions |
| --------------------- | -------- | --------- |
| `turbo_tasks_backend` | 511,227  | 11,437    |
| `turbo_persistence`   | 139,837  | 2,605     |
| `turbo_bincode`       | 729,442  | 11,411    |

### Largest backend functions

| Lines    | Function                                                       | Source                  |
| -------- | -------------------------------------------------------------- | ----------------------- |
| 2,322 ×3 | `ExecuteContextImpl::prepare_tasks_with_callback` (3 variants) | Backend task scheduling |
| 1,656    | `TaskStorage::clone_snapshot`                                  | Snapshot persistence    |
| 1,610    | `TurboTasksBackendInner::run_backend_job`                      | Job dispatch            |
| 1,441    | `AggregationUpdateJob::encode` (bincode)                       | Serialization           |
| 1,410    | `AggregationUpdateJob::decode` (bincode)                       | Deserialization         |
| 1,313    | `TaskStorage::encode_meta`                                     | Metadata persistence    |

### `AggregationUpdateJob` — 72,535 lines total

The aggregation update system (task dependency propagation) is the largest single feature in the backend, spanning 1,264 functions.

### turbo_persistence: LSM-tree storage

The persistence layer implements an LSM-tree database:

| Lines | Function                                   |
| ----- | ------------------------------------------ |
| 1,129 | `TurboPersistence::commit::{closure#4}`    |
| 1,121 | `WriteBatch::flush_thread_local_collector` |
| 1,100 | `StreamingSstWriter::close`                |
| 1,073 | `TurboPersistence::load_directory`         |

---

## 24. Deep Dive: CSS Processing Pipeline — 2.35M Lines (12.0%)

The full CSS pipeline spans multiple crates:

| Crate              | IR Lines      | Functions  |
| ------------------ | ------------- | ---------- |
| lightningcss       | 2,339,335     | —          |
| `swc_css_ast`      | 150,125       | 4,384      |
| `cssparser`        | 148,482       | 1,292      |
| `parcel_selectors` | 89,412        | 938        |
| `swc_css_parser`   | 76,929        | 342        |
| `swc_css_prefixer` | 21,074        | 649        |
| `swc_css_visit`    | 17,403        | 261        |
| `swc_css_codegen`  | 10,647        | 366        |
| `swc_css_utils`    | 13,490        | 123        |
| `swc_css_compat`   | 9,535         | 62         |
| **TOTAL**          | **2,349,278** | **30,471** |

### lightningcss by functional area

| Area                                 | IR Lines | Functions |
| ------------------------------------ | -------- | --------- |
| `values` (length, color, calc, etc.) | 795,547  | 10,537    |
| other (miscellaneous)                | 502,401  | 6,870     |
| `rules` (at-rules, rule lists)       | 276,816  | 3,843     |
| `Property` enum operations           | 161,836  | 947       |
| `border` properties                  | 118,582  | 1,308     |
| `selector` parsing/matching          | 117,761  | 772       |
| parsing                              | 75,317   | 1,571     |
| `animation` properties               | 67,038   | 1,207     |
| `masking` properties                 | 56,193   | 802       |
| `font` properties                    | 46,998   | 811       |
| `background` properties              | 39,170   | 690       |
| `size` properties                    | 22,082   | 217       |
| `flex` properties                    | 15,822   | 301       |
| compat (browser feature checks)      | 9,783    | 38        |

### `Feature::is_compatible` — 8,220 lines (autogenerated)

**Source:** `lightningcss/src/compat.rs` — **entirely autogenerated** by `build-prefixes.js`. Contains hundreds of `Feature` variants (one per CSS spec feature), each with per-browser version range comparisons.

---

## 25. Deep Dive: turbo_tasks_fs — 739,743 Lines (3.8%)

| Lines | Function                                           | Source                                             |
| ----- | -------------------------------------------------- | -------------------------------------------------- |
| 3,187 | `FileSystemPath::to_string_ref` (9 copies)         | `turbopack/crates/turbo-tasks-fs/src/lib.rs`       |
| 2,334 | `resolve_symlink_safely`                           | `turbopack/crates/turbo-tasks-fs/src/read_glob.rs` |
| 2,180 | `RealPathResultError::as_error_message` (2 copies) | Error formatting                                   |

Most `turbo_tasks_fs` IR comes from **functor closures** — functions that take `FileSystemPath` as a turbo-tasks argument get their `functor::{closure#0}` attributed to this crate.

---

## 26. Deep Dive: allsorts (Font Shaping) — 147,546 Lines

```
allsorts ← next-core
```

| Lines | Function                                          |
| ----- | ------------------------------------------------- |
| 3,355 | `gsub_apply_indic` — Indic script shaping         |
| 1,901 | `CFF::subset` — CFF font subsetting               |
| 1,213 | `Woff2Font::table_provider` — WOFF2 decompression |
| 1,197 | `CFF::read` — CFF font parsing                    |
| 935   | `Os2::read_dep` — OS/2 table parsing              |
| 895   | `gpos_apply_lookup` — GPOS positioning            |

---

## 27. Deep Dive: Regex — 204,466 Lines (1.0%)

| Crate            | IR Lines | Functions |
| ---------------- | -------- | --------- |
| `regex_automata` | 157,682  | 1,728     |
| `regex`          | 46,784   | 604       |

Notable: `regex_automata::Cache` drop generates 3,390 lines × 28 copies = 94,920 line×copies product. `Pool<Cache>::put_value` at 7,103 lines × 18 copies is the 6th largest function by line×copies.

---

## 28. Function Size Distribution

| Range       | Functions | Lines     | % of Total |
| ----------- | --------- | --------- | ---------- |
| 1–10        | 105,164   | 436,768   | 2.2%       |
| 11–50       | 138,341   | 3,751,578 | 19.2%      |
| 51–100      | 47,633    | 3,325,049 | 17.0%      |
| 101–500     | 38,409    | 7,557,488 | 38.6%      |
| 501–1,000   | 2,837     | 1,919,796 | 9.8%       |
| 1,001–5,000 | 1,176     | 2,116,579 | 10.8%      |
| 5,001+      | 55        | 476,853   | 2.4%       |

**Key insight:** The "101–500" range accounts for **38.6% of all IR** from only 38,409 functions. These are medium-sized functions — turbo-tasks functor closures (avg ~315 lines), visitor methods, and derived trait impls. They are the primary target for framework-level deduplication.

Only **55 "mega functions"** (>5K lines) exist, totaling 476,853 lines (2.4%). The top 30 are documented in Section 5. Fixing these is high-visibility but low-total-impact compared to the 38K medium functions.

---

## 29. Top 20 Functions by Total Binary Impact (lines × copies)

| lines×copies  | Lines  | Copies | Function                                                  |
| ------------- | ------ | ------ | --------------------------------------------------------- |
| **4,556,002** | 10,102 | 451    | `wast::Instruction::encode::encode`                       |
| **554,820**   | 19,815 | 28     | `drop_in_place::<Expr>`                                   |
| **451,584**   | 2,016  | 224    | `next_core::next_config::__ctor`                          |
| **389,376**   | 1,872  | 208    | `turbo_tasks::primitives::__ctor`                         |
| **368,095**   | 4,045  | 91     | `drop_in_place::<std::io::Error>`                         |
| **318,536**   | 10,984 | 29     | `drop_in_place::<Stmt>`                                   |
| **306,852**   | 11,802 | 26     | `drop_in_place::<TsType>`                                 |
| **289,656**   | 4,023  | 72     | `drop_in_place::<hashbrown::ScopeGuard<rehash_in_place>>` |
| **207,948**   | 1,333  | 156    | `drop_in_place::<String>`                                 |
| **140,625**   | 1,125  | 125    | `turbo_tasks_fs::__ctor`                                  |
| **137,020**   | 5,270  | 26     | `drop_in_place::<Decl>`                                   |
| **127,854**   | 7,103  | 18     | `regex_automata::Pool<Cache>::put_value`                  |
| **127,449**   | 1,071  | 119    | `turbopack_core::resolve::__ctor`                         |
| **124,722**   | 1,066  | 117    | `drop_in_place::<Vec<u8>>`                                |
| **123,201**   | 1,053  | 117    | `next_core::next_import_map::get_rcstr::__ctor`           |
| **116,964**   | 1,026  | 114    | `next_api::project::__ctor`                               |
| **116,334**   | 5,058  | 23     | `RawVc::to_non_local::{closure#0}`                        |
| **99,225**    | 945    | 105    | `next_core::app_structure::__ctor`                        |
| **94,920**    | 3,390  | 28     | `drop_in_place::<regex_automata::Cache>`                  |
| **91,754**    | 3,529  | 26     | `drop_in_place::<AssignTarget>`                           |

The **`wast::Instruction::encode::encode`** dominates by an overwhelming margin: **4.56M line×copies** — 23% of the entire binary's IR by this metric, from a single function encoding WebAssembly opcodes.

---

## 30. Comprehensive Summary

```
Total IR lines:                    19,584,111  (100.0%)

By runtime layer:
  Turbo-tasks framework:            3,754,743  (19.2%)
  Async runtime (tokio+futures):    1,445,382  ( 7.4%)
  NAPI bridge:                        835,092  ( 4.3%)
  Backend persistence:                651,064  ( 3.3%)
  turbo_tasks_fs:                     739,743  ( 3.8%)

By language processing:
  SWC JS/TS (all crates):           4,614,577  (23.6%)
    swc_ecma_ast (types):           2,214,702  (11.3%)
    swc_ecma_visit (visitors):      2,113,042  (10.8%)
    SWC transforms:                   711,000  ( 3.6%)
  CSS pipeline (all):               2,349,278  (12.0%)
    lightningcss:                   2,339,335  (11.9%)
    swc_css_* crates:                 299,203  ( 1.5%)
    cssparser + parcel_selectors:     237,894  ( 1.2%)
  next_custom_transforms:             435,013  ( 2.2%)

By serialization/encoding:
  serde (all):                      2,256,357  (11.5%)
    serde_json:                       857,036  ( 4.4%)
  bincode (turbo-tasks):              772,830  ( 3.9%)
  turbo_bincode:                      729,442  ( 3.7%)

By derived traits (all types):
  Deserialize:                      1,682,960  ( 8.6%)
  Clone:                              210,353  ( 1.1%)
  PartialEq:                          217,429  ( 1.1%)
  Debug:                              185,588  ( 0.9%)
  Serialize:                          154,305  ( 0.8%)
  Hash:                                46,376  ( 0.2%)

Collections/infrastructure:
  hashbrown (HashMap):                595,178  ( 3.0%)
    reserve_rehash monomorphs:      1,353 unique types
  regex + regex_automata:             204,466  ( 1.0%)

External dependencies:
  image + moxcms + pxfm:             627,614  ( 3.2%)
  wast + wasmparser (WASM):           457,426  ( 2.3%)
  allsorts (fonts):                   147,546  ( 0.8%)
  rustls (TLS):                       156,765  ( 0.8%)
  jiff (time):                        111,026  ( 0.6%)
  encoding_rs:                        ~20,000  ( 0.1%)

Destructors:
  drop_in_place (all):              1,312,884  ( 6.7%)

Function size distribution:
  ≤10 lines:    105,164 fns   436,768 lines  ( 2.2%)
  11-50:        138,341 fns 3,751,578 lines  (19.2%)
  51-100:        47,633 fns 3,325,049 lines  (17.0%)
  101-500:       38,409 fns 7,557,488 lines  (38.6%)  ← biggest bucket
  501-1000:       2,837 fns 1,919,796 lines  ( 9.8%)
  1001-5000:      1,176 fns 2,116,579 lines  (10.8%)
  5001+:             55 fns   476,853 lines  ( 2.4%)
```
