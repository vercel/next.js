# Coverage mapping primitive

This bundles `ast-v8-to-istanbul@1.0.7` as a pure converter. It consumes actual
compiled JavaScript, its matching AST and source map, and V8 precise coverage.
It does not load a test controller, Vite, or a replacement compiler.

The Next adapter validates retained artifact and source hashes, range structure,
coordinates and source ownership before calling this converter. It derives
function descriptors from syntax-preserved JavaScript and accepts them only with
an unambiguous one-to-one association to the mapped runtime functions. It keeps
runtime hit counts. Imported TypeScript uses the vendored ESTree parser for authored
body locations while retaining uniquely associated native declaration, statement
and branch maps and their real counters. Runtime TypeScript lowering forms
(enums, namespaces, import/export assignments, parameter properties and decorators)
and ambiguous associations fail explicitly. Unimported TypeScript and JSX require
source analysis bound to the effective Next compiler profile; an independent
transpiler cannot supply that provenance. The internal compile-only analysis
primitive emits a selected TypeScript source through the existing Node development
or production Next session without evaluating it. A parent-issued source hash,
profile, revision and allocated output root authorize map-based declaration
metadata. Execution and runtime coverage consumers reject these analysis artifacts.
The parent selects typed sources and all selected profiles before compilation,
binds each job to a fresh revision and allocated artifact root, and derives the
separate declaration facts while that immutable compiler lease remains alive.
The compiler broker receives only an acknowledgement; compiler children cannot
return declaration facts as runtime capture. One-shot and watch publication
validate every requested source/profile, compare complete descriptor maps, IDs
and metadata, and recheck selected source/configuration bytes before committing.
Runtime facts remain authoritative for hits. Compile-only zeros supply untouched
sources only when the parent's scheduling intent expands that generation; they
never enter the retained runtime coverage cache. Cancellation and changed inputs
veto publication and restore the previous report.

Actual Next development/production named-function TypeScript fixtures are
qualified against complete pristine 5.0.4 maps and counters, including an untouched
module that throws if evaluated. This qualification uses the default configuration
input paths. The parent fences the selected source bytes, owner-supplied configuration
inputs and a finite inventory of supported configuration filenames. Custom
`tsconfigPath` and extended tsconfig files require additional native effective-input
provenance. For source-analysis requests, the ordinary Next config loader retains
its actual CommonJS/ESM module-file loads and explicit import edges with the real
config object's cache identity. A parent-requested artifact sidecar binds those
loaded-byte hashes to the source, profile, revision and allocated output root.
The parent rechecks every selected profile's module graph before and after report
publication, including profiles whose declaration descriptors are identical.

This module-file qualification covers canonical explicit file requests. Cached
modules without retained load evidence, package/extensionless resolution, CJS
cycles with unobserved cache edges, transformed source and detected later loader
changes refuse certification while ordinary config loading keeps its result.
Arbitrary filesystem/network IO and custom loader aliases retained by preloads
remain outside this qualification; these receipts do not claim a complete set of
effective configuration inputs. Partial watch generations with empty source-analysis
plans need a separate runtime receipt lane. JSX, runtime TypeScript lowering and
ambiguous associations remain explicit diagnostics until their compiler provenance
is qualified.
Unimported JavaScript can be parsed for zero-hit declaration coverage without
executing it. This foundation does not establish provider, profile, complete
report/config, watch, sharding or full Vitest coverage conformance.

Run `pnpm --filter=next exec taskr ncc_next_test_coverage` after changing the
bundle, and commit its generated source, declaration and license files together.
