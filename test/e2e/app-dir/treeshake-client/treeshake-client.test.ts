import { nextTestSetup } from 'e2e-utils'

// Regression test for `experimental.turbopackModuleFragments` on the app-client
// (client-references) chunking path. A Server Component imports a named export
// from a "use client" module that is purely a side-effect-free re-export of an
// external `sideEffects: false` barrel. The client facade then has no local
// exports, so binding-usage prunes its `all()` locals part reference down to an
// id-less target. Code generation for `EcmascriptModulePartReference` used to
// still emit `__turbopack_import__(<part id>)`, panicking with:
//   ModuleId not found for ident: .../motion-config.tsx [app-client] <internal part N>
//   - Execution of <EcmascriptModulePartAsset as EcmascriptChunkPlaceable>::chunk_item_content failed
describe('treeshake-client', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('builds a client re-export of a side-effect-free external barrel', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('motion').text()).toBe('k')
  })
})
