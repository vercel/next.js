// Compile with pnpm tsc test/e2e/app-dir/server-source-maps/fixtures/default/external-pkg/sourcemapped.ts --sourceMap --target esnext
// tsc compile errors can be ignored
type Fn<T> = () => T
export function runExternalSourceMapped<T>(fn: Fn<T>): T {
  return fn()
}

export function runSetOfSets(setOfSets: Set<Set<Fn<any>>>): void {
  setOfSets.forEach((set) => {
    set.forEach((fn) => {
      fn()
    })
  })
}

export function runHiddenSetOfSets(message: string): void {
  runSetOfSets(new Set([new Set([() => console.error(new Error(message))])]))
}
