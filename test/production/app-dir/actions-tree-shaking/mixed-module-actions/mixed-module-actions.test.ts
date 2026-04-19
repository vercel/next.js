import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - mixed-module-actions',
  () => {
    const { next } = nextTestSetupActionTreeShaking({
      files: __dirname,
    })

    it('should not do tree shake for cjs module when import server actions', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)
      expect(actionsRoutesState).toMatchInlineSnapshot(`
       {
         "app/mixed-module/cjs/page": [
           "app/mixed-module/cjs/actions.js#cjsModuleTypeAction",
           "app/mixed-module/cjs/actions.js#esmModuleTypeAction",
           "app/mixed-module/cjs/actions.js#unusedModuleTypeAction1",
         ],
         "app/mixed-module/esm/page": [
           "app/mixed-module/esm/actions.js#cjsModuleTypeAction",
           "app/mixed-module/esm/actions.js#esmModuleTypeAction",
           "app/mixed-module/esm/actions.js#unusedModuleTypeAction1",
         ],
       }
      `)
    })
  }
)
