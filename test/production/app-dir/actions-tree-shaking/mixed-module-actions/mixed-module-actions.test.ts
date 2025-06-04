import { nextTestSetup } from 'e2e-utils'
import {
  getActionsRoutesStateByRuntime,
  markLayoutAsEdge,
} from '../_testing/utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - mixed-module-actions',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    if (process.env.TEST_EDGE) {
      markLayoutAsEdge(next)
    }

    it('should not do tree shake for cjs module when import server actions', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

      expect(actionsRoutesState).toMatchObject({
        'app/mixed-module/esm/page': {
          rsc: 3,
        },
        // CJS import is not able to tree shake, so it will include all actions
        'app/mixed-module/cjs/page': {
          rsc: 3,
        },
      })
    })
  }
)
