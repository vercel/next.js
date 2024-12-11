// Compile with p tsc test/e2e/app-dir/server-source-maps/fixtures/default/internal-pkg/sourcemapped.ts --sourceMap --target esnext
// tsc compile errors can be ignored
type Fn<T> = () => T
export function run<T>(fn: Fn<T>): T {
  return fn()
}
