import { A } from './A'
import { D } from './D'

/*
 * {A,B,C,D}.ts and asyncImportFn.ts have an import graph topology that
 * exposes a bug in `compute_async_module_info_single` in turbopack. Requesting
 * this page (localhost:3000/api/test) will fail with:
 *   TypeError: (0 , t.C) is not a function
 * This is because C has been marked as an async module, but D hasn't.
 *
 * route
 * |   \
 * v    v
 * A<-  D
 * |  \ |
 * v   \v
 * B--->C
 * |
 * v
 * async
 */

/*
 * `mangleExportNames` is turned off for this fixture in options.json to work
 * around a KNOWN BUG, not because of anything specific to this test.
 *
 * With mangling on, every module with exports is split into a facade + locals
 * pair, and an import cycle of split modules that also contains an async module
 * never finishes building: `follow_reexports` steps facade -> <locals> and then
 * stalls inside the locals module's `get_exports()`, which awaits the original
 * module's `analyze()` — already in flight further up the same cycle. The
 * process sits at ~0.5% CPU with flat RSS and never spawns Node, so it is a
 * turbo-tasks await cycle rather than a loop. `compute_async_module_info_single`
 * is never reached, despite the topology above.
 *
 * The bug is pre-existing on canary and needs nothing but a re-export, an
 * import cycle and a top-level `await` — see the standalone reproduction on
 * branch `fleet/turbopack-reexport-cycle-deadlock-repro`, under
 * `execution/turbopack/side-effect-optimization/__hangs__/reexport-cycle-async-deadlock`.
 * Mangling only makes it much easier to reach, by splitting every module with
 * exports instead of only re-exporting ones.
 *
 * Remove this opt-out once that deadlock is fixed.
 */

it('should handle cycles in async modules', () => {
  A(10)
  D(10)
  expect(true).toBe(true)
})
