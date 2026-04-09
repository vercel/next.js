# LLVM IR Lines Analysis — next-napi-bindings (canary @ 9cf9a63264)

Generated with:

```
CARGO_PROFILE_RELEASE_LTO=fat cargo llvm-lines --release -p next-napi-bindings
```

---

## 1. Top-Line Summary

| Metric                             | Value                |
| ---------------------------------- | -------------------- |
| **Total IR lines**                 | 19,584,111           |
| **Total function copies**          | 366,016              |
| **Unique functions (1 copy each)** | ~337,741             |
| **Monomorphized duplicates**       | ~28,275 extra copies |

The binary is large. It contains the entire Turbopack bundler, SWC JS/TS transforms, CSS processing (lightningcss), WebAssembly parsing, image processing, TLS, and the turbo-tasks async task runtime — all statically linked and LTO'd together.

---

## 2. IR Lines by Crate (Functions Referencing That Crate's Types)

The "grep" totals below count any function whose mangled name contains the crate — i.e., functions from _other_ crates that operate on this crate's types are included. This is more meaningful than "which crate defined the function."

| Crate                         | IR Lines  | % of Total | Notes                                                            |
| ----------------------------- | --------- | ---------- | ---------------------------------------------------------------- |
| `turbo_tasks` (name match)    | 3,592,903 | 18.3%      | Entire turbo-tasks framework, including wrappers in other crates |
| `swc_ecma_ast` (name match)   | 2,214,702 | 11.3%      | SWC JS/TS AST types — permeates the whole binary                 |
| `lightningcss` (grep)         | 2,339,335 | 11.9%      | CSS parser/transformer                                           |
| `serde` (grep)                | 2,256,357 | 11.5%      | Serialization framework                                          |
| `core` (first-crate)          | 2,334,107 | 11.9%      | Rust std infrastructure (drop glue, iter adapters)               |
| `alloc` (first-crate)         | 1,321,554 | 6.7%       | Box, Vec, String allocation                                      |
| `hashbrown` (grep)            | 595,178   | 3.0%       | HashMap implementation                                           |
| `next_core` (grep)            | 1,293,423 | 6.6%       | Next.js build logic                                              |
| `turbopack_ecmascript` (grep) | 1,103,876 | 5.6%       | JS module bundling                                               |
| `turbopack_core` (grep)       | 1,084,069 | 5.5%       | Bundler core                                                     |
| `futures_util` (first-crate)  | 345,317   | 1.8%       | Async utilities                                                  |
| `serde_json` (first-crate)    | 328,860   | 1.7%       | JSON parsing                                                     |
| `moxcms`                      | 295,372   | 1.5%       | ICC color management (via `image`)                               |
| `wasmparser`                  | 234,156   | 1.2%       | WASM parsing (Turbopack Wasm support)                            |
| `wast`                        | 223,270   | 1.1%       | WASM text format (Turbopack Wasm support)                        |
| `image`                       | 216,592   | 1.1%       | Image optimization (Next.js `<Image>`)                           |
| `swc_ecma_minifier`           | 175,461   | 0.9%       | JS minification                                                  |
| `napi`                        | 191,138   | 1.0%       | Node.js native addon bridge                                      |
| `rustls`                      | 156,765   | 0.8%       | TLS (HTTPS fetching)                                             |
| `pxfm`                        | 115,650   | 0.6%       | Special math functions (via `image`)                             |
| `jiff`                        | 111,026   | 0.6%       | Date/time library                                                |

---

## 3. Functional Category Breakdown

Categorizing by what the code _does_:

| Category                                                                 | IR Lines      | % of Total |
| ------------------------------------------------------------------------ | ------------- | ---------- |
| `#[turbo_tasks::function]` wrappers (all `_turbo_tasks_function_inline`) | **2,399,952** | **12.2%**  |
| `drop_in_place` (all destructor calls)                                   | **1,312,884** | **6.7%**   |
| `bincode` Decode/Encode (turbo-tasks task persistence)                   | **772,830**   | **3.9%**   |
| `ValueDebugFormat` impls                                                 | **413,730**   | **2.1%**   |
| `hashbrown` operations                                                   | **595,178**   | **3.0%**   |
| `TaskInput::resolve_input`                                               | **65,042**    | **0.3%**   |
| `TraceRawVcs` impls                                                      | **30,603**    | **0.16%**  |
| `__ctor` registration boilerplate                                        | **72,586**    | **0.4%**   |
| closures / async state machines                                          | **6,350,591** | **32.4%**  |

The **32.4% closure/async category** dominates because Turbopack is almost entirely async — every `#[turbo_tasks::function]` body is an `async fn` which becomes a large async state machine capturing its local variables.

---

## 4. Top 20 Largest Individual Functions

| Rank | IR Lines | Copies | Function                                                            |
| ---- | -------- | ------ | ------------------------------------------------------------------- |
| 1    | 19,815   | 28     | `drop_in_place::<swc_ecma_ast::Expr>`                               |
| 2    | 18,646   | 1      | `lightningcss::BorderHandler::flush`                                |
| 3    | 15,322   | 1      | `swc_ecma_transforms_base::InjectHelpers::build_imports`            |
| 4    | 13,557   | 1      | `lightningcss::Property::deserialize::<ContentDeserializer>`        |
| 5    | 13,557   | 1      | `lightningcss::Property::deserialize::<serde ContentDeserializer>`  |
| 6    | 13,160   | 1      | `lightningcss::Property::parse`                                     |
| 7    | 12,101   | 1      | `turbopack_ecmascript::references::handle_well_known_function_call` |
| 8    | 11,802   | 26     | `drop_in_place::<swc_ecma_ast::TsType>`                             |
| 9    | 11,788   | 1      | `rustls::FfdheGroup::named_group`                                   |
| 10   | 11,357   | 1      | `turbopack_ecmascript::CodeGen::code_generation`                    |
| 11   | 11,117   | 1      | `image::imageops::gaussian_blur_dyn_image`                          |
| 12   | 10,984   | 29     | `drop_in_place::<swc_ecma_ast::Stmt>`                               |
| 13   | 10,755   | 1      | `swc_css_parser::is_named_color`                                    |
| 14   | 10,370   | 1      | `ExperimentalConfig::decode` (bincode)                              |
| 15   | 10,102   | 451    | `wast::Instruction::encode::encode`                                 |
| 16   | 9,928    | 1      | `ExperimentalConfig::value_debug_format`                            |
| 17   | 9,783    | 1      | `next_api::AppEndpoint::output_turbo_tasks_function_inline`         |
| 18   | 9,197    | 1      | `NextConfig::decode` (bincode)                                      |
| 19   | 9,192    | 1      | `get_server_module_options_context_turbo_tasks_function_inline`     |
| 20   | 8,836    | 1      | `swc_ecma_transforms_module::SystemJs::fold_module`                 |

---

## 5. The `#[turbo_tasks::function]` Macro Cost: 2.4M Lines

**27,087 wrapper functions** totalling **2,399,952 IR lines** (~88 lines/wrapper on average).

Every `#[turbo_tasks::function]` annotation generates:

1. A `_turbo_tasks_function_inline` closure — the actual async body, typed over the full argument tuple
2. A `TaskFnInputFunction::functor` monomorphization — dispatches `resolve_input` on each argument
3. A `TaskFnInputFunction::args_cells` monomorphization — stores arguments as task cells
4. A thin outer shim that registers the function type at startup

Because each function has a unique argument tuple type, every one of these wrappers is a separate monomorphization with no sharing. With 27,087 functions in the codebase, this framework overhead alone accounts for 12.2% of all IR.

**Biggest individual function wrappers:**

- `AppEndpoint::output_turbo_tasks_function_inline`: 9,783 lines
- `get_server_module_options_context_turbo_tasks_function_inline`: 9,192 lines
- `ModuleOptions::new_internal_turbo_tasks_function_inline`: 8,484 lines

These are large because their argument tuples are large (many `Vc<T>` arguments × resolve_input per argument).

---

## 6. `drop_in_place` Analysis: 1.31M Lines (6.7%)

**28,275 destructor functions** totalling **1,312,884 lines**.

### swc_ecma_ast drop_in_place: 168,337 lines across 930 functions / 4,049 copies

The SWC AST is the primary driver. Every place in the binary that _owns_ and _drops_ an AST node generates a new inlined copy of the recursive drop glue:

| Type                 | Total Lines | Copies | Lines/Copy |
| -------------------- | ----------- | ------ | ---------- |
| `Expr`               | 19,815      | 28     | 708        |
| `TsType`             | 11,802      | 26     | 454        |
| `Stmt`               | 10,984      | 29     | 379        |
| `Decl`               | 5,270       | 26     | 203        |
| `AssignTarget`       | 3,529       | 26     | 136        |
| `Prop`               | 3,257       | 21     | 155        |
| `ModuleItem`         | 3,099       | 26     | 119        |
| `Box<Expr>`          | 2,790       | 31     | 90         |
| `ClassMember`        | 2,762       | 11     | 251        |
| `TsImportType`       | 2,584       | 32     | 81         |
| `SimpleAssignTarget` | 2,191       | 11     | 199        |
| `ModuleDecl`         | 2,161       | 13     | 166        |

**Why so many copies?** `Expr`, `Stmt`, `TsType` etc. are deep recursive enums. LLVM cannot share their drop glue across callers because fat LTO inlines the full recursive drop chain at each call site, producing a unique copy per CGU (code generation unit) context. The 28–32 copies correspond roughly to the number of CGUs that contain owned AST nodes.

### Other large drop_in_place contributors:

| Type                            | Total Lines        |
| ------------------------------- | ------------------ |
| `String`                        | 1,625 (156 copies) |
| `Vec<u8>`                       | 1,053 (117 copies) |
| `lightningcss::Property`        | 3,943 (4 copies)   |
| `JoinAll<AsyncFormattingField>` | 2,060 (21 copies)  |
| `RawVc::to_non_local closure`   | 872 (24 copies)    |

---

## 7. lightningcss: 2.34M Lines (11.9%)

The CSS processing pipeline is the second-largest contributor after the turbo-tasks framework.

| Function                                           | Lines  | Copies |
| -------------------------------------------------- | ------ | ------ |
| `BorderHandler::flush`                             | 18,646 | 1      |
| `Property::deserialize` (×2 deserializer variants) | 27,114 | 2      |
| `Property::parse`                                  | 13,160 | 1      |
| `Feature::is_compatible`                           | 8,220  | 1      |
| `SizeHandler::flush`                               | 6,896  | 1      |
| `CssRuleList::minify`                              | 6,468  | 2      |
| `Property::serialize::<napi::Ser>`                 | 5,520  | 1      |
| `MaskHandler::handle_property`                     | 5,405  | 1      |
| `Property::eq` (3 copies — LTO artifact)           | 14,583 | 3      |
| `Property::clone` (4 copies)                       | 13,255 | 4      |

`BorderHandler::flush` at 18,646 lines is the **single largest function in the entire binary**. It's a hand-written state machine that handles CSS shorthand property flushing — all the sub-properties of `border` (width, style, color, top/right/bottom/left) are accumulated and emitted together. The size is inherent to the CSS spec's complexity.

`Property::eq` appearing as 3 separate copies (`.1123`, `.6225`, unnamed) is an LTO artifact where LLVM failed to merge three identical implementations across CGU boundaries.

---

## 8. The `wast` Crate: 451-Copy Monomorphization (10,102 lines)

**`<wast::Instruction as wast::encode::Encode>::encode::encode` has 451 copies**, making it the most-copied single function in the binary.

`wast` is the WebAssembly Text Format parser — it's a dependency of Turbopack's WASM module support. The `Instruction` enum has ~600 variants (one per Wasm opcode). The `encode` function is a giant `match` over all variants. The 451 copies arise because:

1. The `encode` inner function is generic over a `Write` impl
2. It gets monomorphized for each concrete `Write` type used at call sites
3. With fat LTO, the linker keeps all of them because they come from different instantiation contexts

`wast` total: **223,270 lines** from 3,540 functions. This is significant for a crate that handles a secondary feature (Wasm support). The 451 copies alone cost 10,102 lines.

---

## 9. Next.js Config: Bincode + ValueDebugFormat Bloat

The two largest single functions in the binary (excluding drop_in_place) come from `NextConfig` and `ExperimentalConfig`:

| Function                                 | Lines  |
| ---------------------------------------- | ------ |
| `ExperimentalConfig::decode` (bincode)   | 10,370 |
| `ExperimentalConfig::value_debug_format` | 9,928  |
| `NextConfig::decode` (bincode)           | 9,197  |
| `NextConfig::value_debug_format`         | 5,286  |

`ExperimentalConfig` has ~90 optional fields. Because `bincode::Decode` is derived, it generates a sequential decode-each-field function with no factoring — everything inlines into one giant function. Similarly, `ValueDebugFormat` generates a recursive pretty-printer that formats every field.

**Total bincode Decode/Encode cost**: 772,830 lines (3.9%) across 12,380 functions.  
**Total ValueDebugFormat cost**: 413,730 lines (2.1%) across 4,269 functions.

These are structural costs of the turbo-tasks model: every `#[turbo_tasks::value]` struct must implement both traits.

---

## 10. `__ctor` Registration Boilerplate: 72,586 Lines

Every `#[turbo_tasks::value]` and `#[turbo_tasks::function]` registers itself at startup via linker `__ctor` (init-array) sections. This generates a small function per item, but the copy count is high:

| `__ctor` source                   | Lines | Copies  |
| --------------------------------- | ----- | ------- |
| `next_core::next_config::__ctor`  | 2,016 | **224** |
| `turbo_tasks::primitives::__ctor` | 1,872 | **208** |
| `turbo_tasks_fs::__ctor`          | 1,125 | **125** |
| `turbopack_core::resolve::__ctor` | 1,071 | **119** |
| `next_api::project::__ctor`       | 1,026 | **114** |

224 copies of `next_config::__ctor` means there are 224 individually registered turbo-tasks items in the `next_config` module alone. Total: **795 `__ctor` functions** generating **72,586 lines** at 8,105 copies.

---

## 11. `TraceRawVcs`: 30,603 Lines (0.16%)

`TraceRawVcs` is the trait that allows the turbo-tasks GC to find all `Vc<T>` handles inside a value. Every `#[turbo_tasks::value]` must implement it.

- **2,268 implementations**, 30,603 total lines
- Average ~13.5 lines per impl
- These are small but there are many of them

Notable: `turbopack_core::resolve::options::ResolveOptions::trace_raw_vcs` is one of the larger impls at 269 lines — `ResolveOptions` contains many nested `Vc<T>` fields.

The 30,603 lines is **0.16% of total** — relatively minor. `TraceRawVcs` is not a significant bloat source.

---

## 12. `RawVc::resolve` / `TaskInput::resolve_input`: 65,042 Lines (0.3%)

Every `Vc<T>` argument to a `#[turbo_tasks::function]` must be resolved before the task runs (to detect if the cached result is still valid). `TaskInput::resolve_input` is the async function that does this.

- **2,073 implementations** totalling **65,042 lines**
- The largest: `ReferenceType::resolve_input` at 3,503 lines (3 copies) — `ReferenceType` is a large enum with many `Vc<T>` fields
- `FileSystemPath::resolve_input`: 1,400 lines (10 copies)

Note: The previous analysis mentioned 697 monomorphized variants of `RawVc::resolve`. In this (canary) build, the grep for `RawVc` + resolve finds **9,346 lines across 506 copies from 510 functions** — slightly different but the same order of magnitude.

---

## 13. Surprising Dependencies and Their Costs

### `moxcms` — 295,372 lines (1.5%)

ICC color profile / color management system. Pulled in by the `image` crate for color space conversion during Next.js `<Image>` optimization. Its `do_any_to_any` function is monomorphized over multiple numeric types and LUT sizes (e.g., `<u8, 8, 256, 4096>`, `<f64, 1, 65536, 65536>`).

### `pxfm` — 115,650 lines (0.6%)

Special mathematical functions (gamma, digamma, trigamma, Bessel functions). Also via `image` — used for high-quality resampling kernels in `gaussian_blur_dyn_image` (11,117 lines, the 11th largest function in the binary). These are inherently large because they implement complex numerical algorithms.

### `wast` + `wasmparser` — 223,270 + 234,156 = 457,426 lines (2.3%)

WebAssembly text and binary format support for Turbopack's Wasm module handling. `wast::Instruction::encode` with 451 copies is the worst monomorphization in the binary.

### `jiff` — 111,026 lines (0.6%)

A comprehensive date/time library. Likely used for file modification time handling in `turbo_tasks_fs` or build metadata. `jiff::fmt::strtime::Parser::parse` alone is 8,813 lines — the 22nd largest function.

### `rustls` — 156,765 lines (0.8%)

TLS for HTTPS in the dev server or fetching. `FfdheGroup::named_group` at **11,788 lines** is the **9th largest function in the binary** — a massive match over all FFDHE (Finite Field Diffie-Hellman Ephemeral) groups for TLS 1.3 key exchange. This is unavoidable given the TLS spec.

### `encoding_rs` — ~16,000+ lines visible

Character encoding support. `VariantDecoder::decode_to_utf8_raw` is 8,118 lines, `VariantEncoder::encode_from_utf8_raw` is 5,763 lines, `decode_to_utf16_raw` is 5,567 lines — these are giant match statements over all ~40 character encodings.

---

## 14. serde Costs: 2.26M Lines (11.5%)

Serde permeates the binary because:

1. `lightningcss::Property::deserialize` — 13,557 lines × 2 deserializer types
2. `swc_ecma_visit::AstParentKind::deserialize` via bincode — 4,479 lines
3. `NextConfig::deserialize` via serde_json + serde_path_to_error — 4,650 lines

The 2,256,357 total serde lines come from 36,761 functions. Every type that is sent through NAPI, stored in turbo-tasks persistence, or read from next.config.js goes through serde. The `ContentDeserializer` monomorphizations (which serde uses internally for buffered deserialization) are particularly expensive.

---

## 15. Monomorphization Hotspots (Most Copies)

| Copies  | Lines  | Function                            |
| ------- | ------ | ----------------------------------- |
| **451** | 10,102 | `wast::Instruction::encode::encode` |
| **224** | 2,016  | `next_core::next_config::__ctor`    |
| **208** | 1,872  | `turbo_tasks::primitives::__ctor`   |
| **156** | 1,333  | `drop_in_place::<String>`           |
| **125** | 1,125  | `turbo_tasks_fs::__ctor`            |
| **119** | 1,071  | `turbopack_core::resolve::__ctor`   |
| **117** | 1,053  | `drop_in_place::<Vec<u8>>`          |
| **114** | 1,026  | `next_api::project::__ctor`         |
| **107** | 214    | `FnOnce::call_once`                 |
| **105** | 945    | `next_core::app_structure::__ctor`  |

No function exceeds 451 copies. The threshold is low because fat LTO is effective at deduplication — the high copy counts that remain are either genuinely different monomorphizations (different type parameters) or LTO failures at CGU boundaries.

---

## 16. Actionable Optimization Opportunities

Ranked by estimated IR savings:

### Tier 1: High Impact (>100K lines potential savings)

**A. `#[turbo_tasks::function]` wrapper sharing**  
2,399,952 lines from 27,087 wrappers. The `TaskFnInputFunction::functor` is generic over the full argument tuple `(A, B, C, ...)`. If turbo-tasks introduced a type-erased argument resolver (boxing individual `resolve_input` futures instead of monomorphizing per tuple), each wrapper could shrink from ~88 lines to ~20 lines. Estimated savings: **1-1.5M lines**.

**B. `NextConfig`/`ExperimentalConfig` bincode + ValueDebugFormat**  
10,370 + 9,928 + 9,197 + 5,286 = 34,781 lines just for the 4 largest. The full `ExperimentalConfig` decode is 10K lines because the struct has ~90 fields. Splitting `ExperimentalConfig` into sub-structs (e.g., `ExperimentalOutputConfig`, `ExperimentalCompilerConfig`) would distribute the decode/debug functions and prevent the single-function-size explosion. Estimated savings: **20-30K lines** for the top 4, plus proportional savings across all derived impls.

**C. `wast::Instruction::encode` copy reduction**  
451 copies × 22.4 avg = 10,102 lines. File an issue with the `wast` crate upstream to make the inner `encode` function non-generic (write bytes directly to `&mut dyn Write` instead of `impl Write`). This would reduce 451 copies to 1. Savings: **~9,900 lines**.

### Tier 2: Medium Impact (10K–100K lines)

**D. `lightningcss::Property` clone deduplication**  
4 copies of `Property::clone` totalling 13,255 lines — these should be 1 copy. LTO failed to merge them. Workaround: make `Property::clone` `#[inline(never)]`. Savings: **~10K lines**.

**E. swc_ecma_ast drop_in_place**  
168,337 total lines from 930 functions. The root cause is LLVM inlining recursive drop glue. The fix is an explicit iterative `Drop` impl on `Expr`, `Stmt`, `TsType` in upstream SWC that uses a stack instead of recursion — this makes the drop glue non-recursive and prevents LLVM from usefully inlining it further. This is an upstream SWC change. Savings: **80-120K lines** (copies would collapse from 28 to ~3).

**F. `image` + `moxcms` + `pxfm` feature gating**  
216K + 295K + 115K = 626K lines for image processing. If image optimization is moved to a separate process (Node.js child process or separate native addon), these crates can be removed from the main binary. This is a significant architectural change but would cut **~3%** of total IR.

### Tier 3: Low Impact (<10K lines)

**G. `__ctor` deduplication**  
The 224 copies of `next_config::__ctor` are genuinely 224 different init functions (one per registered type/function). No duplication — these are correct. Nothing to optimize here without reducing the number of registered items.

**H. `TraceRawVcs`**  
30,603 lines total. Already small. Not worth optimizing.

**I. `rustls::FfdheGroup::named_group`**  
11,788 lines — inherent to the TLS spec. Not addressable without changing the TLS library.

---

## 17. Summary of Key Numbers

```
Total IR lines:                    19,584,111  (100%)

turbo-tasks framework overhead:
  _turbo_tasks_function_inline:     2,399,952  (12.2%)
  bincode Decode/Encode:              772,830  ( 3.9%)
  ValueDebugFormat:                   413,730  ( 2.1%)
  TaskInput::resolve_input:            65,042  ( 0.3%)
  TraceRawVcs:                         30,603  ( 0.2%)
  __ctor boilerplate:                  72,586  ( 0.4%)
  SUBTOTAL framework overhead:      3,754,743  (19.2%)

swc_ecma_ast (all references):      2,214,702  (11.3%)
  of which drop_in_place:             168,337  ( 0.9%)

lightningcss:                       2,339,335  (11.9%)
serde (framework):                  2,256,357  (11.5%)
hashbrown:                            595,178  ( 3.0%)

Surprising deps:
  wast + wasmparser (Wasm support):   457,426  ( 2.3%)
  image + moxcms + pxfm (img opt):   626,614  ( 3.2%)
  rustls (TLS):                       156,765  ( 0.8%)
  jiff (time):                        111,026  ( 0.6%)
  encoding_rs:                        ~20,000  ( 0.1%)

Total drop_in_place:                1,312,884  ( 6.7%)
```

The single biggest lever for reducing binary size is **the turbo-tasks function wrapper infrastructure at 12.2%**. The framework's design of monomorphizing the full argument tuple for each task means every new `#[turbo_tasks::function]` adds ~88 lines of IR overhead regardless of how simple the function is.
