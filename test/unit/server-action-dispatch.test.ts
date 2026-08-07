import { getServerActionDispatchContext } from '../../packages/next/src/client/server-action-dispatch'

describe('Server Action dispatch', () => {
  it('fails when routing metadata was not registered for an action', async () => {
    await expect(
      getServerActionDispatchContext('unregistered-action')
    ).rejects.toThrow(
      'Invariant: Missing Server Action dispatch context. This indicates that the action routing metadata was not registered for this action.'
    )
  })
})
