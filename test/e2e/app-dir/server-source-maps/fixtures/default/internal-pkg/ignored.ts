// Compile with pnpm tsc test/e2e/app-dir/server-source-maps/fixtures/default/internal-pkg/ignored.ts --sourceMap --target esnext
// tsc compile errors can be ignored
// Then ensure `ignoreList` references all `sources`
type Fn<T> = () => T
export function runInternalIgnored<T>(fn: Fn<T>): T {
  return fn()
}
