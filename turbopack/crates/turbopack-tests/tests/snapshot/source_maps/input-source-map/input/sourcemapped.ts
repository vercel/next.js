// Compile with pnpm tsc turbopack/crates/turbopack-tests/tests/snapshot/source_maps/input-source-map/input/sourcemapped.ts --sourceMap --inlineSources --target esnext
// tsc compile errors can be ignored
type Fn<T> = () => T
export function runExternalSourceMapped<T>(fn: Fn<T>): T {
  return fn()
}
