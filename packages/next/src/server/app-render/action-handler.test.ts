jest.mock('./manifests-singleton', () => {
  const actual = jest.requireActual<typeof import('./manifests-singleton')>(
    './manifests-singleton'
  )
  return {
    ...actual,
    selectWorkerForForwarding: jest.fn((actionId: string, pageName: string) =>
      actual.selectWorkerForForwarding(actionId, pageName)
    ),
  }
})

import {
  parseHostHeader,
  selectPeerWorkerForForwarding,
} from './action-handler'
import * as manifestsSingleton from './manifests-singleton'

const selectWorkerForForwardingMock =
  manifestsSingleton.selectWorkerForForwarding as jest.MockedFunction<
    typeof manifestsSingleton.selectWorkerForForwarding
  >

describe('parseHostHeader', () => {
  it('should return correct host', () => {
    expect(parseHostHeader({})).toBe(undefined)

    expect(
      parseHostHeader({
        host: 'www.foo.com',
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: undefined,
        'x-forwarded-host': 'www.foo.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': undefined,
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })
  })

  it('should return x-forwarded-host over host header', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return correct x-forwarded-host when provided in array', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': [],
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com, www.baz.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return whichever matches provided origin', () => {
    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
        },
        'www.foo.com'
      )
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com'],
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': 'www.bar.com, www.baz.com',
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })
})

describe('selectPeerWorkerForForwarding', () => {
  beforeEach(() => {
    selectWorkerForForwardingMock.mockClear()
    selectWorkerForForwardingMock.mockImplementation((actionId, page) =>
      jest
        .requireActual<
          typeof import('./manifests-singleton')
        >('./manifests-singleton')
        .selectWorkerForForwarding(actionId, page)
    )
  })

  it('does not call selectWorkerForForwarding when the action was already forwarded', () => {
    expect(
      selectPeerWorkerForForwarding('action-id', '/some/page', true)
    ).toBeUndefined()

    expect(selectWorkerForForwardingMock).not.toHaveBeenCalled()
  })

  it('does not call selectWorkerForForwarding when actionId is undefined', () => {
    expect(
      selectPeerWorkerForForwarding(undefined, '/some/page', false)
    ).toBeUndefined()

    expect(selectWorkerForForwardingMock).not.toHaveBeenCalled()
  })

  it('delegates to selectWorkerForForwarding when forwarding is allowed', () => {
    selectWorkerForForwardingMock.mockImplementation(() => '/app/foo/page')

    expect(
      selectPeerWorkerForForwarding('action-id', '/some/page', false)
    ).toBe('/app/foo/page')

    expect(selectWorkerForForwardingMock).toHaveBeenCalledWith(
      'action-id',
      '/some/page'
    )
  })
})
