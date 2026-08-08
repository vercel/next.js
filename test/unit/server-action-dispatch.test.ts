import { getServerActionDispatchContext } from '../../packages/next/src/client/server-action-dispatch'
import { createServerActionRoutingKey } from '../../packages/next/src/shared/lib/server-action-routing-key'

describe('Server Action dispatch', () => {
  it('creates routing keys without Web Crypto', () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto'
    )
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(createServerActionRoutingKey('00' + 'a'.repeat(40))).toBe(
        '2wrzw4qvvu65cf24ef4'
      )
    } finally {
      if (cryptoDescriptor === undefined) {
        delete (globalThis as { crypto?: Crypto }).crypto
      } else {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
      }
    }
  })

  it('falls back when routing metadata was not registered for an action', () => {
    expect(
      getServerActionDispatchContext('unregistered-action')
    ).toBeUndefined()
  })

  it('uses routing metadata from the response that created the reference', () => {
    const actionId = '00' + 'b'.repeat(40)
    const routingKey = createServerActionRoutingKey(actionId)
    const context = { url: '/source?value=1', nextUrl: null }

    expect(
      getServerActionDispatchContext(actionId, {
        context,
        routingKeys: [routingKey],
      })
    ).toBe(context)
  })
})
