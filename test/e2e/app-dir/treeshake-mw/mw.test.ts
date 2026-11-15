import { nextTestSetup } from 'e2e-utils'

// Regression test for `experimental.turbopackModuleFragments` + Node.js-runtime
// middleware that imports a binding through a star re-export barrel.
//
// The build used to panic during middleware chunking with:
//   ModuleId not found for ident: .../lib/barrel.ts [middleware] (ecmascript) <internal part N>
//   - Execution of <SideEffectsModule as EcmascriptChunkPlaceable>::chunk_item_content failed
//
// Cause: a re-export module with imports but no top-level side effects is
// classified `ModuleEvaluationIsSideEffectFree`. `follow_reexports` treats that
// as side-effectful (`!= SideEffectFree`) and builds a `SideEffectsModule` that
// emits `TURBOPACK_IMPORT(<eval part id>)`, but `compute_side_effect_free_module_info`
// classifies the same module as side-effect-free, so binding-usage prunes the
// `Evaluation` edge and the eval part never gets a module id.
//
// The build completing and the middleware running is the assertion.
describe('treeshake-mw', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('builds and runs Node.js middleware importing via a star re-export', async () => {
    const res = await next.fetch('/')
    expect(res.headers.get('x-key')).toBe('k')
  })
})
