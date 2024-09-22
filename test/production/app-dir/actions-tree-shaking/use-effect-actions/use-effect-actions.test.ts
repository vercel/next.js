import { nextTestSetup } from 'e2e-utils'
import {
  getActionsRoutesStateByRuntime,
  markLayoutAsEdge,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
describe.skip('actions-tree-shaking - use-effect-actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  if (process.env.TEST_EDGE) {
    markLayoutAsEdge(next)
  }

  it('should not tree shake the used action under useEffect', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

    expect(actionsRoutesState).toMatchObject({
      'app/mixed/page': {
        'action-browser': 3,
      },
    })
  })
})
