import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - basic',
  () => {
    const { next } = nextTestSetupActionTreeShaking({
      files: __dirname,
    })

    it('should not have the unused action in the manifest', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)
      expect(actionsRoutesState).toMatchInlineSnapshot(`
       {
         "app/client/page": [
           "app/actions.js#clientComponentAction",
         ],
         "app/inline/page": [
           "app/inline/page.js#$$RSC_SERVER_ACTION_0",
         ],
         "app/server/page": [
           "app/actions.js#clientComponentAction",
           "app/actions.js#serverComponentAction",
           "app/actions.js#unusedExportedAction",
         ],
       }
      `)
    })
  }
)
