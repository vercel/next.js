import { nextTestSetup } from 'e2e-utils'
import {
  getActionsRoutesStateByRuntime,
  markLayoutAsEdge,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.TURBOPACK ? describe : describe.skip)(
  'actions-tree-shaking - shared-module-actions',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    if (process.env.TEST_EDGE) {
      markLayoutAsEdge(next)
    }

    it('should not have the unused action in the manifest', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

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
  }
)
