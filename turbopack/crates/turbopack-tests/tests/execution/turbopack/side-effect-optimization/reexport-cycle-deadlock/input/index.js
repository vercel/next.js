import { A } from './A'

/*
 * Regression test: turbopack used to hang (deadlock) while building the module
 * graph for an import cycle whose modules are split into facade + locals
 * modules.
 *
 * Topology:
 *
 *   index -> A
 *            ^\
 *            | v
 *            C<-B -> syncFn
 *
 * A, B and C each carry `export { helper } from './helper'`. That re-export is
 * enough to make `EcmascriptExports::split_locals_and_reexports` return true,
 * so each of them is split into an `EcmascriptModuleFacadeModule` plus an
 * `EcmascriptModuleLocalsModule`.
 *
 * This is the same bug as `../reexport-cycle-async-deadlock`, but without any
 * async module: a top-level `await` anywhere in the cycle is not required to
 * trigger it. The re-export cycle alone is enough.
 */

it('should not deadlock building a re-exporting import cycle', () => {
  A(10)
  expect(true).toBe(true)
})
