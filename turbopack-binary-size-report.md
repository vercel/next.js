# Turbopack Binary Size Analysis Report

**Date:** 2025-07-09
**Binary:** `next-napi-bindings` (cdylib → `next_swc.*.node`)
**Features:** `plugin` (Wasmer/Cranelift SWC plugin support)
**Profile:** Release (`lto = "thin"`, `codegen-units = 1`)
**Target:** `x86_64-unknown-linux-gnu`
**Toolchain:** `nightly-2026-04-02`
**Tools:** `cargo-bloat 0.12.1`, `nm`, `objdump`, `size`

## Executive Summary

| Metric                         | Size                                   |
| ------------------------------ | -------------------------------------- |
| Unstripped binary              | **153 MiB**                            |
| Stripped binary                | **103 MiB**                            |
| Stripped + gzipped             | **34.3 MiB**                           |
| `.text` section (code)         | **71.8 MiB**                           |
| `.eh_frame` (exception tables) | **8.4 MiB**                            |
| `.rodata` (read-only data)     | **7.6 MiB**                            |
| `.rela.dyn` (relocations)      | **6.2 MiB**                            |
| `.gcc_except_table`            | **4.2 MiB**                            |
| `.data.rel.ro`                 | **2.2 MiB**                            |
| Debug info (all sections)      | **~5.4 MiB**                           |
| Total dependencies             | **1,069 unique crates** (702 compiled) |

The binary is large because it bundles **five major subsystems** into a single shared library: a full JS/TS compiler (SWC), a CSS compiler (LightningCSS), a complete bundler framework (Turbopack), a reactive computation engine (turbo-tasks), and a WebAssembly runtime with JIT compiler (Wasmer+Cranelift). Every one of these is a substantial piece of software on its own.

## 1. Size by Major Subsystem

### `.text` Section Breakdown (71.8 MiB of executable code)

| Subsystem                          | Size         | % of .text | Notes                                      |
| ---------------------------------- | ------------ | ---------- | ------------------------------------------ |
| **Turbo-tasks system**             | **21.6 MiB** | **30.1%**  | Reactive computation engine + backend + fs |
| **Turbopack bundler**              | **22.3 MiB** | **31.1%**  | All turbopack-\* crates                    |
| **SWC compiler**                   | **16.8 MiB** | **23.4%**  | JS/TS/CSS parsing, transforms, codegen     |
| **Next.js crates**                 | **14.4 MiB** | **20.1%**  | next-core, next-api, etc.                  |
| **WASM engine (Wasmer+Cranelift)** | **9.5 MiB**  | **13.2%**  | SWC plugin runtime                         |
| **LightningCSS**                   | **8.0 MiB**  | **11.1%**  | CSS parsing + transforms                   |
| **std library**                    | **7.0 MiB**  | **9.8%**   | Rust standard library                      |

> Note: These overlap — many turbo-tasks symbols appear under their consuming crate (e.g. turbopack-core
> monomorphizes turbo-tasks generics). Percentages sum to >100% due to cross-attribution.

### Detailed Subsystem Breakdown

#### Turbo-tasks System (21.6 MiB)

| Component           | Size     |
| ------------------- | -------- |
| turbo-tasks core    | 16.8 MiB |
| turbo-tasks-fs      | 3.1 MiB  |
| turbo-tasks-backend | 1.6 MiB  |

The turbo-tasks core is **the single largest contributor** at 16.8 MiB. This is largely due
to monomorphization — the `#[turbo_tasks::function]` macro generates per-type task wrapper
code, and the `Vc<T>` type is generic over hundreds of turbopack types. The top monomorphized
function is `conditional_update_with_shared_reference` at **1,266 instances / 1.36 MiB**.

#### Turbopack Bundler (22.3 MiB)

| Component            | Size    |
| -------------------- | ------- |
| turbopack-core       | 9.7 MiB |
| turbopack-ecmascript | 6.9 MiB |
| turbopack-css        | 1.3 MiB |
| turbopack-node       | 1.0 MiB |
| turbopack-browser    | 0.7 MiB |
| turbopack-trace      | 0.6 MiB |
| turbopack-resolve    | 0.4 MiB |
| turbopack-other      | 1.7 MiB |

#### SWC Compiler (16.8 MiB)

| Component              | Size    |
| ---------------------- | ------- |
| swc_ecma_visit         | 5.0 MiB |
| swc_ecma_ast           | 2.8 MiB |
| swc_ecma_minifier      | 2.2 MiB |
| swc_other (core crate) | 2.0 MiB |
| swc_ecma_transforms    | 1.4 MiB |
| swc_css (all)          | 1.0 MiB |
| swc_ecma_parser        | 0.8 MiB |
| swc_ecma_other         | 0.7 MiB |
| swc_ecma_compat        | 0.4 MiB |
| swc_plugin             | 0.3 MiB |
| swc_ecma_preset        | 0.3 MiB |

The SWC visitor pattern (`swc_ecma_visit` at 5 MiB) is large because it generates
`Visit`, `VisitMut`, and `Fold` trait implementations for every AST node type, and
each consumer (minifier, transforms, etc.) monomorphizes these generics.

#### WASM Engine (9.5 MiB) — Plugin Runtime

| Component         | Size      |
| ----------------- | --------- |
| wasmer            | 5.3 MiB   |
| cranelift-codegen | 2.2 MiB   |
| wast (WAT parser) | 0.8 MiB   |
| wasmparser        | 0.5 MiB   |
| webc              | 0.5 MiB   |
| virtual_fs        | 0.2 MiB   |
| regalloc2         | ~0.03 MiB |

**PR #91533 targets this subsystem.** The wasmer ecosystem contributes ~9.5 MiB to .text.
The Cranelift JIT alone is 2.2 MiB. The `wast` crate (WAT text format parser) adds 0.8 MiB
and is likely unnecessary at runtime — it's for parsing `.wat` text format, not `.wasm` binaries.

#### Next.js Crates (14.4 MiB)

| Component              | Size    |
| ---------------------- | ------- |
| next-core              | 6.6 MiB |
| next-api               | 4.4 MiB |
| next-napi-bindings     | 2.0 MiB |
| next-custom-transforms | 1.3 MiB |

## 2. Top 20 Crates by `.text` Size (cargo bloat)

| Rank | Crate                  | Size    | % of .text |
| ---- | ---------------------- | ------- | ---------- |
| 1    | turbo_tasks            | 7.5 MiB | 10.5%      |
| 2    | std                    | 7.0 MiB | 9.8%       |
| 3    | turbopack_ecmascript   | 4.3 MiB | 5.9%       |
| 4    | turbopack_core         | 4.1 MiB | 5.7%       |
| 5    | next_core              | 4.0 MiB | 5.6%       |
| 6    | lightningcss_napi      | 3.7 MiB | 5.1%       |
| 7    | wasmer_wasix           | 3.3 MiB | 4.5%       |
| 8    | lightningcss           | 3.0 MiB | 4.2%       |
| 9    | next_api               | 1.8 MiB | 2.5%       |
| 10   | swc_ecma_minifier      | 1.8 MiB | 2.5%       |
| 11   | cranelift_codegen      | 1.7 MiB | 2.4%       |
| 12   | swc                    | 1.3 MiB | 1.9%       |
| 13   | turbopack_css          | 1.0 MiB | 1.4%       |
| 14   | next_custom_transforms | 1.0 MiB | 1.3%       |
| 15   | turbo_tasks_backend    | 967 KiB | 1.3%       |
| 16   | turbopack_node         | 898 KiB | 1.2%       |
| 17   | swc_ecma_parser        | 895 KiB | 1.2%       |
| 18   | swc_ecma_ast           | 834 KiB | 1.1%       |
| 19   | wast                   | 767 KiB | 1.0%       |
| 20   | swc_ecma_compat_es2015 | 650 KiB | 0.9%       |

## 3. Top 20 Functions by Size

| Size    | Crate                    | Function                                        |
| ------- | ------------------------ | ----------------------------------------------- |
| 121 KiB | cranelift_codegen        | `constructor_simplify` (ISLE peephole rules)    |
| 108 KiB | swc_ecma_transforms_base | `InjectHelpers::build_imports`                  |
| 102 KiB | next_custom_transforms   | `TransformOptions` serde deserialize            |
| 94 KiB  | lightningcss             | `BorderHandler::flush`                          |
| 75 KiB  | turbo_tasks_backend      | `TurboTasksBackendInner` (monomorphized Either) |
| 56 KiB  | lightningcss_napi        | `TransformVisitor::visit_rule`                  |
| 52 KiB  | lightningcss             | `Property::parse`                               |
| 52 KiB  | swc                      | `build_transform`                               |
| 52 KiB  | swc_ecma_minifier        | `ManglePropertiesPass` deserialize              |
| 48 KiB  | lightningcss             | `css_modules::CssModule::analyze`               |
| 43 KiB  | turbo_tasks              | `VcRead::value_to_trace_raw_vc`                 |
| 39 KiB  | wast                     | `Wat::parse_buf`                                |
| 37 KiB  | lightningcss             | `PropertyHandler::flush`                        |
| 37 KiB  | lightningcss_napi        | N-API serialize                                 |
| 36 KiB  | lightningcss             | `Property::to_css`                              |
| 34 KiB  | turbo_tasks              | `Vc::resolve`                                   |
| 32 KiB  | swc_ecma_ast             | `Expr` bincode serialize                        |
| 31 KiB  | lightningcss             | `PropertyHandler::handle_property`              |
| 30 KiB  | next_custom_transforms   | `TransformOptions` N-API deserialize            |
| 30 KiB  | swc_ecma_ast             | `Expr as Fold`                                  |

## 4. Monomorphization Analysis

These are the **top generic functions by total size across all instantiations**:

| Total Size | Instances | Function Pattern                                           |
| ---------- | --------- | ---------------------------------------------------------- |
| 6.1 MiB    | 23,565    | `core::ptr::drop_in_place`                                 |
| 1.4 MiB    | 1,266     | `CurrentCellRef::conditional_update_with_shared_reference` |
| 688 KiB    | 877       | `turbo_tasks::native_function::resolve_functor_impl`       |
| 612 KiB    | 274       | `swc_ecma_ast::expr::Expr` (various trait impls)           |
| 552 KiB    | 1,009     | `serde_content::de::Deserializer`                          |
| 413 KiB    | 612       | `::new` (various constructors)                             |
| 373 KiB    | 389       | `serde::private::de::content::visit_content_map`           |
| 317 KiB    | 257       | `swc_ecma_ast::stmt::Stmt` (various trait impls)           |
| 312 KiB    | 469       | `cssparser::parser::parse_nested_block`                    |
| 298 KiB    | 484       | `::new_typed_with_env`                                     |
| 294 KiB    | 662       | `serde ContentDeserializer`                                |
| 282 KiB    | 654       | `(turbo_tasks_fs::FileSystemPath, ...)` tuple impls        |
| 280 KiB    | 202       | `hashbrown::reserve_rehash`                                |
| 264 KiB    | 1,313     | `drop_slow`                                                |
| 258 KiB    | 420       | `BTreeMap::Handle` operations                              |
| 249 KiB    | 854       | `(Vc<Box<dyn ...>>, ...)` tuple impls                      |

**Key finding:** `drop_in_place` alone accounts for **6.1 MiB** across 23,565 instantiations.
This is inherent to Rust's monomorphization model — every unique type that is dropped
needs its own `drop_in_place`. The turbo-tasks system with its many `Vc<T>` types exacerbates this.

The `turbo_tasks::native_function::resolve_functor_impl` at 877 instances / 688 KiB is
generated per `#[turbo_tasks::function]` annotated function. With hundreds of turbo-tasks
functions across the codebase, this adds up.

## 5. Non-Code Sections

| Section                       | Size         | Notes                                                             |
| ----------------------------- | ------------ | ----------------------------------------------------------------- |
| `.eh_frame` + `.eh_frame_hdr` | **9.5 MiB**  | Exception handling tables. Could be reduced with `-C panic=abort` |
| `.gcc_except_table`           | **4.2 MiB**  | C++ exception tables (from C deps).                               |
| `.rela.dyn`                   | **6.2 MiB**  | Dynamic relocations. Inherent to cdylib (shared library).         |
| `.rodata`                     | **7.6 MiB**  | String literals, const data, lookup tables                        |
| `.data.rel.ro`                | **2.2 MiB**  | Relocated read-only data (vtables, etc.)                          |
| Debug info                    | **~5.4 MiB** | Stripped away in release builds                                   |

The `.eh_frame` section at 9.5 MiB is significant. With `-C panic=abort`, most of this
could be eliminated since stack unwinding tables wouldn't be needed.

## 6. Duplicate Dependencies

There are **~50 crates with duplicate versions** in the dependency tree. Notable ones:

| Crate                                    | Versions                     | Impact                                     |
| ---------------------------------------- | ---------------------------- | ------------------------------------------ |
| `hashbrown`                              | 0.12, 0.13, 0.14, 0.15, 0.16 | **5 versions!** Each compiles separately   |
| `rkyv`                                   | 0.7, 0.8                     | Large serialization framework              |
| `itertools`                              | 0.10, 0.12, 0.13             | 3 versions                                 |
| `darling`                                | 0.14, 0.20, 0.21             | 3 versions (proc-macro, compile-time only) |
| `syn`                                    | 1.0, 2.0                     | Proc-macro only, doesn't affect binary     |
| `icu_properties` + `icu_properties_data` | v1 + v2                      | Unicode data tables                        |
| `wasmparser`                             | 0.224, 0.235                 | WASM parsing                               |

## 7. Actionable Recommendations

### High Impact (estimated 10-20 MiB savings)

#### 7a. Remove `wast` crate (~0.8 MiB .text)

The `wast` crate parses WAT text format (`.wat` files). SWC plugins are distributed as
compiled `.wasm` binaries, not WAT text. If `wast` is only pulled in transitively through
wasmer and not actually used, it could potentially be excluded. Check if any code path
actually needs WAT parsing.

#### 7b. Consider `-C panic=abort` (~9-13 MiB total savings)

Switching to `panic=abort` would:

- Eliminate `.eh_frame` / `.eh_frame_hdr` (~9.5 MiB)
- Eliminate `.gcc_except_table` (~4.2 MiB)
- Remove unwinding codepaths from `.text`

**Trade-off:** No panic unwinding, no `catch_unwind`. Check if any code relies on catching
panics (e.g., for graceful degradation). Since this is a Node.js native addon, panics
typically abort the process anyway.

#### 7c. Reduce turbo-tasks monomorphization (~2-5 MiB potential)

The `#[turbo_tasks::function]` macro generates significant per-type code. Consider:

- **Dynamic dispatch where possible:** Where `Vc<Box<dyn Trait>>` is already used, the
  underlying task infrastructure could potentially use trait objects instead of monomorphizing
  for each concrete type.
- **Reduce `conditional_update_with_shared_reference` instances (1,266 × 1.1 KiB = 1.4 MiB):**
  This function is monomorphized for every turbo-tasks value type. Consider making it
  type-erased internally with a thin typed wrapper.
- **Reduce `resolve_functor_impl` instances (877 × 0.8 KiB = 688 KiB):** Similarly,
  explore if the functor resolution can be made more type-erased.

#### 7d. `opt-level = "z"` for more crates

Currently ~20 crates have `opt-level = "s"` (optimize for size). Consider:

- Switching to `"z"` (aggressive size optimization) for cold-path crates
- Adding more crates to the size-optimized list. Candidates based on this analysis:
  - `wasmer_wasix` (3.3 MiB, currently no override)
  - `turbopack_trace_server` (372 KiB, rarely on hot path)
  - `webc` (371 KiB, currently no override)
  - `wasmer_config` (302 KiB)
  - `ring` (285 KiB)
  - `swc_ecma_visit` (223 KiB .text, but 5 MiB in nm — discrepancy suggests it's inlined elsewhere)
  - `swc_ecma_ast` (834 KiB)
  - `aho_corasick` (218 KiB)
  - `image` (208 KiB)
  - `virtual_fs` (204 KiB)
  - `brotli_decompressor` (171 KiB)

#### 7e. Review `wasmer_wasix` necessity (3.3 MiB .text)

`wasmer_wasix` (WASI support for Wasmer) is the **7th largest crate** at 3.3 MiB. SWC
plugins may or may not need full WASI support. If plugins only need basic WASI (file I/O,
env vars), a lighter WASI implementation could save significant space. This is related to
PR #91533's approach of switching the WASM engine entirely.

### Medium Impact (estimated 2-5 MiB savings)

#### 7f. Deduplicate `hashbrown` versions (5 versions!)

Having 5 versions of `hashbrown` means 5 copies of hash map implementation code. While
each is pulled in by different transitive deps, updating dependency versions to converge
on a single `hashbrown` version would help. The total `hashbrown` contribution is ~138 KiB
in cargo-bloat, but the real impact is larger since it's monomorphized many times.

#### 7g. Review `lightningcss-napi` (3.7 MiB .text)

`lightningcss-napi` is the **6th largest** crate. It provides Node.js N-API bindings for
LightningCSS. Check if all of its functionality is needed, or if some features could be
disabled. The NAPI serialization layer contributes significant code.

#### 7h. Reduce serde monomorphization (~7.3 MiB across codebase)

Serde-related symbols total 7.3 MiB. The `serde_content::de::Deserializer` alone has
1,009 instances (552 KiB). Consider:

- Using `#[serde(deserialize_with)]` to share deserializer implementations
- Using `erased-serde` for cold paths to reduce monomorphization
- Reducing the number of types with `#[derive(Serialize, Deserialize)]`

#### 7i. fat LTO instead of thin LTO

The Cargo.toml comments mention that `fat LTO + share-generics + codegen-units = 1`
is optimal for deduplication. Currently `thin` LTO is used. Fat LTO would enable
better cross-crate identical function merging at the cost of longer build times.
This could save 2-5% of .text size.

### Low Impact / Long-Term

#### 7j. `strip = "symbols"` in release profile

The release profile doesn't explicitly set `strip`. Adding `strip = "symbols"` would
produce a pre-stripped binary (103 MiB vs 153 MiB). This is likely already done in CI
but worth having in the profile.

#### 7k. Profile-guided optimization (PGO)

PGO can reduce binary size by 5-10% by better informing the compiler about hot/cold paths.
Cold code gets optimized for size while hot code gets optimized for speed.

#### 7l. Feature-gate the trace server

`turbopack-trace-server` contributes 372 KiB. If not needed in production builds, it
could be feature-gated.

#### 7m. Consolidate duplicate `icu_properties_data`

Two versions of ICU property data tables are being compiled. These are const data arrays
that contribute to `.rodata`.

## 8. What's NOT Low-Hanging Fruit

- **SWC size (16.8 MiB):** This is a full JS/TS compiler. Hard to reduce without
  dropping features (parser, minifier, transforms are all essential).
- **Turbopack core logic (22.3 MiB):** This is the bundler itself. The code is necessary.
- **std library (7.0 MiB):** Rust standard library. Cannot be reduced.
- **Monomorphization in general:** Rust's zero-cost abstractions come at a binary size
  cost. The `drop_in_place` instances (6.1 MiB, 23K instances) are fundamental to Rust.

## Appendix: Full cargo bloat --crates Output

```
 File  .text      Size Crate
 4.9%  10.5%    7.5MiB turbo_tasks
 4.6%   9.8%    7.0MiB std
 2.8%   5.9%    4.3MiB turbopack_ecmascript
 2.7%   5.7%    4.1MiB turbopack_core
 2.6%   5.6%    4.0MiB next_core
 2.4%   5.1%    3.7MiB lightningcss_napi
 2.1%   4.5%    3.2MiB wasmer_wasix
 2.0%   4.2%    3.0MiB lightningcss
 1.2%   2.5%    1.8MiB next_api
 1.2%   2.5%    1.8MiB swc_ecma_minifier
 1.1%   2.4%    1.7MiB cranelift_codegen
 0.9%   1.9%    1.3MiB swc
 0.6%   1.4% 1005.2KiB turbopack_css
 0.6%   1.3%  979.9KiB next_custom_transforms
 0.6%   1.3%  967.4KiB turbo_tasks_backend
 0.6%   1.2%  897.6KiB turbopack_node
 0.6%   1.2%  895.2KiB swc_ecma_parser
 0.5%   1.1%  833.7KiB swc_ecma_ast
 0.5%   1.0%  767.4KiB wast
 0.4%   0.9%  650.3KiB swc_ecma_compat_es2015
 0.4%   0.9%  634.4KiB turbo_tasks_fs
 0.3%   0.7%  539.6KiB regex_automata
 0.3%   0.7%  496.9KiB rustls
 0.3%   0.7%  488.4KiB next_napi_bindings
 0.3%   0.7%  480.9KiB turbopack_browser
 0.3%   0.6%  468.2KiB tokio
 0.3%   0.6%  465.6KiB turbopack
 0.3%   0.6%  442.8KiB wasmparser
 0.3%   0.6%  427.4KiB styled_jsx
 0.3%   0.6%  406.8KiB turbopack_nodejs
 0.2%   0.5%  389.9KiB swc_ecma_transforms_base
 0.2%   0.5%  372.3KiB turbopack_trace_server
 0.2%   0.5%  371.2KiB webc
 0.2%   0.5%  365.6KiB [Unknown]
 0.2%   0.5%  344.3KiB swc_ecma_transforms_optimization
 0.2%   0.4%  327.6KiB swc_ecma_transforms_proposal
 0.2%   0.4%  302.4KiB wasmer_config
 0.2%   0.4%  293.2KiB swc_sourcemap
 0.2%   0.4%  288.4KiB napi
 0.2%   0.4%  285.0KiB ring
 0.2%   0.4%  276.8KiB turbopack_ecmascript_plugins
 0.2%   0.4%  259.5KiB swc_ecma_transforms_module
 0.2%   0.4%  257.6KiB swc_ecma_utils
 0.2%   0.3%  251.1KiB serde_json
 0.2%   0.3%  249.5KiB handlebars
 0.2%   0.3%  248.8KiB turbopack_resolve
 0.2%   0.3%  238.8KiB serde_core
 0.2%   0.3%  236.3KiB swc_ecma_transformer
 0.1%   0.3%  227.2KiB wasmer_compiler_cranelift
 0.1%   0.3%  222.7KiB reqwest
 0.1%   0.3%  222.7KiB swc_ecma_visit
 0.1%   0.3%  218.1KiB aho_corasick
 0.1%   0.3%  207.5KiB image
 0.1%   0.3%  204.2KiB virtual_fs
 0.1%   0.3%  196.8KiB swc_ecma_transforms_typescript
 0.1%   0.3%  190.4KiB wasmer_compiler
 0.1%   0.2%  178.4KiB wasmer_package
 0.1%   0.2%  176.8KiB swc_css_prefixer
 0.1%   0.2%  170.5KiB brotli_decompressor
 0.1%   0.2%  168.5KiB browserslist
 0.1%   0.2%  167.9KiB swc_ecma_compat_es2022
 0.1%   0.2%  167.0KiB version_check
 0.1%   0.2%  164.7KiB swc_ecma_compat_bugfixes
 0.1%   0.2%  162.8KiB mdxjs
 0.1%   0.2%  161.1KiB styled_components
 0.1%   0.2%  153.2KiB markdown
 0.1%   0.2%  148.3KiB swc_config
 0.1%   0.2%  141.3KiB regex_syntax
 0.1%   0.2%  141.2KiB swc_ecma_preset_env
 0.1%   0.2%  137.8KiB turbopack_image
 0.1%   0.2%  137.3KiB hashbrown
 0.1%   0.2%  132.6KiB regress
 0.1%   0.2%  126.0KiB swc_plugin_backend_wasmer
 0.1%   0.2%  125.7KiB toml_edit
 0.1%   0.2%  125.2KiB swc_common
 0.1%   0.2%  121.8KiB zstd_sys
 0.1%   0.2%  113.7KiB allsorts
 0.1%   0.2%  113.3KiB turbo_persistence
 0.1%   0.2%  111.4KiB swc_plugin_runner
 0.1%   0.2%  110.8KiB swc_ecma_transforms_react
 3.6%   7.6%    5.5MiB And 318 more crates
47.0% 100.0%   71.8MiB .text section size, the file size is 152.7MiB
```

## Appendix: Symbol Pattern Analysis

Total sizes of symbols matching each pattern (from `nm -S` analysis):

| Pattern                     | Total Size | Notes                                              |
| --------------------------- | ---------- | -------------------------------------------------- |
| turbo_tasks symbols         | 21.6 MiB   | Includes monomorphized generics in consumer crates |
| SWC visitor/fold symbols    | 13.1 MiB   | AST traversal trait impls                          |
| LightningCSS symbols        | 8.0 MiB    | CSS processing                                     |
| Serde (de)serialize symbols | 7.3 MiB    | Pervasive serialization                            |
| Wasmer symbols              | 5.3 MiB    | WASM runtime                                       |
| Cranelift symbols           | 2.4 MiB    | JIT compiler                                       |
