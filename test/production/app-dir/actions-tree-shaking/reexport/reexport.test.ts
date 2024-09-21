import { nextTestSetup } from 'e2e-utils'
import {
  getActionsRoutesStateByRuntime,
  markLayoutAsEdge,
} from '../_testing/utils'

describe('actions-tree-shaking - reexport', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  if (process.env.TEST_EDGE) {
    markLayoutAsEdge(next)
  }

  it('should not have the unused action in the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

    expect(actionsRoutesState).toMatchObject({
      'app/namespace-reexport/server/page': {
        // Turbopack does not tree-shake server side chunks
        rsc: process.env.TURBOPACK ? 3 : 1,
      },
      'app/namespace-reexport/client/page': {
        // Turbopack does not support tree-shaking export * as we don't have global information
        'action-browser': process.env.TURBOPACK ? 3 : 1,
      },
      // We're not able to tree-shake these re-exports here in webpack mode
      'app/named-reexport/server/page': {
        // Turbopack supports tree-shaking these re-exports
        rsc: process.env.TURBOPACK ? 1 : 3,
      },
      'app/named-reexport/client/page': {
        'action-browser': 3,
      },
    })
  })
})
