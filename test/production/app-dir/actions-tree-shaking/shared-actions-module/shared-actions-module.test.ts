import { nextTestSetup } from 'e2e-utils'
import { getActionsRoutesStateByRuntime } from '../_testing/utils'

describe('actions-tree-shaking - shared-actions-module', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have the unused action in the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(
      next,
      'node'
    )

    expect(actionsRoutesState).toMatchObject({
      'app/server/one/page': {
        rsc: 1,
      },
      'app/server/two/page': {
        rsc: 1,
      },
      'app/client/one/page': {
        'action-browser': 1,
      },
      'app/client/two/page': {
        'action-browser': 1,
      },
    })
  })
})
