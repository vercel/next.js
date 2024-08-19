import { nextTestSetup } from 'e2e-utils'
import { getActionsRoutesStateByRuntime } from '../_testing/utils'

describe('actions-tree-shaking - reexport', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have the unused action in the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(
      next,
      'node'
    )

    expect(actionsRoutesState).toMatchObject({
      'app/namespace-reexport/server/page': {
        rsc: 1,
      },
      'app/namespaced-reexport/client/page': {
        'action-browser': 1,
      },
      'app/named-reexport/server/page': {
        rsc: 1,
      },
      'app/named-reexport/client/page': {
        'action-browser': 1,
      },
    })
  })
})
