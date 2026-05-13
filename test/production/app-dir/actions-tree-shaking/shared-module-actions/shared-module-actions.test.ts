import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - shared-module-actions',
  () => {
    const { next } = nextTestSetupActionTreeShaking({
      files: __dirname,
    })

    it('should not have the unused action in the manifest', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)
      expect(actionsRoutesState).toMatchInlineSnapshot(`
       {
         "app/client/one/page": [
           "app/client/actions.js#sharedClientLayerAction",
         ],
         "app/client/two/page": [
           "app/client/actions.js#sharedClientLayerAction",
         ],
         "app/server/one/page": [
           "app/server/actions.js#sharedServerLayerAction",
           "app/server/actions.js#unusedServerLayerAction1",
           "app/server/actions.js#unusedServerLayerAction2",
         ],
         "app/server/two/page": [
           "app/server/actions.js#sharedServerLayerAction",
           "app/server/actions.js#unusedServerLayerAction1",
           "app/server/actions.js#unusedServerLayerAction2",
         ],
       }
      `)
    })
  }
)
