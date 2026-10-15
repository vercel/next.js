# Coverage mapping primitive

This bundles `ast-v8-to-istanbul@1.0.7` as a pure converter. It consumes actual
compiled JavaScript, its matching AST and source map, and V8 precise coverage.
It does not load a test controller, Vite, or a replacement compiler.

The Next adapter validates retained artifact and source hashes, range structure,
coordinates and source ownership before calling this converter. It derives
function descriptors from syntax-preserved JavaScript and accepts them only with
an unambiguous one-to-one association to the mapped runtime functions. It keeps
runtime hit counts. TypeScript/JSX and ambiguous transformations fail explicitly.
Unimported JavaScript can be parsed for zero-hit declaration coverage without
executing it. This foundation does not establish provider, profile, complete
report/config, watch, sharding or full Vitest coverage conformance.

Run `pnpm --filter=next exec taskr ncc_next_test_coverage` after changing the
bundle, and commit its generated source, declaration and license files together.
