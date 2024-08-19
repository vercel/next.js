import { nextTestSetup } from 'e2e-utils'
import { getActionsRoutesStateByRuntime } from '../_testing/utils'

describe('actions-tree-shaking - mixed-module-actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have the unused action in the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(
      next,
      'node'
    )

    expect(actionsRoutesState).toMatchObject({})
  })
})
