# Turbopack Ecmascript Runtime

This package holds the JavaScript code that is injected at runtime for Turbopack to function, such as chunk loading and module factory instantiation. In development, this includes hot module reload (a.k.a. fast refresh) runtime code.

## Turbopack JavaScript runtime code

This Turbopack browser runtime JavaScript code lives as TypeScript files in the following directories named `runtime`:

- `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime`
- `turbopack/crates/turbopack-ecmascript-runtime/js/src/nodejs/runtime`
- `turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime`

Files in these directories are compiled and concatenated at Rust build-time to form the code that gets executed in browser and Node at runtime. These files are not EcmaScript modules nor CommonJS modules -- instead, the TypeScript uses `<reference>` tags to reference other values and types in scope when the files are concatenated. Other ts code in the runtime crate _can_ use esm though, such as: `turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/dev/hmr-client/`.
