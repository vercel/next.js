import { parseHostHeader } from './action-handler'
import {
  getServerModuleMap,
  setManifestsSingleton,
} from './manifests-singleton'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

describe('server module map', () => {
  const actionId = '00' + 'a'.repeat(40)
  const missingActionId = '00' + 'b'.repeat(40)

  beforeAll(() => {
    setManifestsSingleton({
      page: '/test',
      clientReferenceManifest: {} as ClientReferenceManifest,
      serverActionsManifest: {
        encryptionKey: '',
        node: {
          [actionId]: {
            workers: {
              'app/test/page': {
                moduleId: 'test-module',
                async: false,
              },
            },
          },
        },
        edge: {},
      },
    })
  })

  it('resolves valid server reference IDs', () => {
    expect(getServerModuleMap()[actionId]).toEqual({
      id: 'test-module',
      name: actionId,
      chunks: [],
      async: false,
    })
  })

  it('rejects plausible server reference IDs that are missing', () => {
    expect(() => getServerModuleMap()[missingActionId]).toThrow(
      `Failed to find Server Action "${missingActionId}".`
    )
  })

  it.each([actionId.slice(1), actionId + 'a'])(
    'rejects server reference IDs with an invalid length',
    (invalidActionId) => {
      expect(() => getServerModuleMap()[invalidActionId]).toThrow(
        'The Server Reference ID did not match the expected format.'
      )
    }
  )

  it.each(['toJSON', '_debugInfo', '@@iterator'])(
    'does not treat framework reflection probe "%s" as a server reference ID',
    (prop) => {
      expect(getServerModuleMap()[prop]).toBeUndefined()
    }
  )

  it('does not treat symbol probes as server reference IDs', () => {
    expect(Reflect.get(getServerModuleMap(), Symbol.iterator)).toBeUndefined()
  })
})

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
