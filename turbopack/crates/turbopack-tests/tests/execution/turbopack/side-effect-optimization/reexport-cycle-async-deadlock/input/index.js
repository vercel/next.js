import { A } from './A'

/*
 * Regression test: turbopack used to hang (deadlock) while building the module
 * graph for an import cycle whose modules are split into facade + locals
 * modules.
 *
 * Topology (same shape as ../../async-modules/cycle-2, plus re-exports):
 *
 *   index -> A
 *            ^\
 *            | v
 *            C<-B -> asyncFn (top-level await)
 *
 * A, B and C each carry `export { helper } from './helper'`. That re-export is
 * enough to make `EcmascriptExports::split_locals_and_reexports` return true,
 * so each of them is split into an `EcmascriptModuleFacadeModule` plus an
 * `EcmascriptModuleLocalsModule`.
 *
 * Resolving `import { A } from './A'` goes through `apply_reexport_tree_shaking`
 * (module resolution, `turbopack/src/lib.rs`), which calls
 * `follow_reexports(A_facade, "A")`. That walks facade -> locals, and the locals
 * step used to ask the locals module for its side effects, which are derived
 * from the original module's `analyze()` — already in flight further up the same
 * import cycle. The result was a turbo-tasks await cycle: the process sat at
 * ~0.5% CPU with completely flat RSS and never finished, so `next build` would
 * hang with no output and no error.
 *
 * The async module is not required to trigger this; see
 * `../reexport-cycle-deadlock` for the same cycle without a top-level `await`.
 */

it('should not deadlock building a re-exporting import cycle with an async module', () => {
  A(10)
  expect(true).toBe(true)
})
