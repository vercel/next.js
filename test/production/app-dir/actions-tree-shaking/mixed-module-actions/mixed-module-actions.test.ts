import { nextTestSetup } from 'e2e-utils'
import { getActionsRoutesStateByRuntime } from '../_testing/utils'

describe('actions-tree-shaking - mixed-module-actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not do tree shake for cjs module when import server actions', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(
      next,
      'node'
    )

    expect(actionsRoutesState).toMatchObject({
      'app/mixed-module/esm/page': {
        rsc: 1,
      },
      // CJS import is not able to tree shake, so it will include all actions
      'app/mixed-module/cjs/page': {
        rsc: 3,
      },
    })
  })
})
