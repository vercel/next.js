import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'

describe('actions-tree-shaking - use-effect-actions', () => {
  const { next } = nextTestSetupActionTreeShaking({
    files: __dirname,
  })

  it('should not tree shake the used action under useEffect', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(next)
    expect(actionsRoutesState).toMatchInlineSnapshot(`
     {
       "app/mixed/page": [
         "app/mixed/actions.ts#action1",
         "app/mixed/actions.ts#action2",
         "app/mixed/actions.ts#action3",
       ],
     }
    `)
  })
})
