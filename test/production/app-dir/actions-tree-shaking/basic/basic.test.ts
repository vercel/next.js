import { nextTestSetup } from 'e2e-utils'
import { getActionsRoutesStateByRuntime } from '../_testing/utils'

describe('actions-tree-shaking - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have the unused action in the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(
      next,
      'node'
    )

    expect(actionsRoutesState).toMatchObject({
      'app/page': {
        rsc: 1, // only one server layer action
        'action-browser': 1, // only one browser layer action
      },
    })
  })
})
