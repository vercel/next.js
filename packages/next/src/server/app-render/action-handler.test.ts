import {
  createForwardedActionResponse,
  parseHostHeader,
} from './action-handler'
import { addRequestMeta } from '../request-meta'
import { NodeNextRequest, NodeNextResponse } from '../base-http/node'
import {
  NEXT_RESUME_HEADER,
  NEXT_RESUME_STATE_LENGTH_HEADER,
} from '../../lib/constants'
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
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

describe('createForwardedActionResponse', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  function createMockReqRes({ withActionBody }: { withActionBody: boolean }) {
    const rawReq = new EventEmitter() as EventEmitter & {
      method: string
      url: string
      headers: Record<string, string>
    }
    rawReq.method = 'POST'
    rawReq.url = '/b'
    rawReq.headers = {
      host: 'example.com',
      [NEXT_RESUME_HEADER]: '1',
      [NEXT_RESUME_STATE_LENGTH_HEADER]: '123',
    }

    const req = new NodeNextRequest(rawReq as any)
    addRequestMeta(req, 'initURL', 'http://example.com/a')
    if (withActionBody) {
      // Simulates app-page-runtime.ts having already read the request
      // stream to extract the postponed state, stashing the remaining
      // action body for later use (either by the local action handler, or
      // by createForwardedActionResponse when forwarding to another
      // worker).
      addRequestMeta(req, 'actionBody', Buffer.from('the-action-body'))
    }

    const rawRes = {
      getHeaders: () => ({}),
    } as unknown as ServerResponse
    const res = new NodeNextResponse(rawRes)

    return { req, res }
  }

  it('forwards the stashed action body and drops resume headers instead of re-reading the exhausted request stream', async () => {
    const { req, res } = createMockReqRes({ withActionBody: true })
    const streamSpy = jest.spyOn(req, 'stream')

    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    global.fetch = fetchMock as unknown as typeof fetch

    const host = parseHostHeader({ host: 'example.com' })

    await createForwardedActionResponse(
      req,
      res,
      host,
      '/b',
      '',
      '00' + 'a'.repeat(40)
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]

    // The forwarded body should be the stashed action body, not a (already
    // exhausted) re-read of the request stream, which would otherwise hang
    // forever waiting for data that will never arrive.
    expect(init.body).toEqual(new Uint8Array(Buffer.from('the-action-body')))

    // Once the body no longer starts with the postponed state, the resume
    // headers no longer apply, and must not be forwarded, or the receiving
    // worker will fail trying to read postponed state from the body.
    const forwardedHeaders = init.headers as Headers
    expect(forwardedHeaders.has(NEXT_RESUME_HEADER)).toBe(false)
    expect(forwardedHeaders.has(NEXT_RESUME_STATE_LENGTH_HEADER)).toBe(false)

    // The request stream must never be read in this case, since it was
    // already consumed upstream.
    expect(streamSpy).not.toHaveBeenCalled()
  })

  it('falls back to the request stream when there is no stashed action body', async () => {
    const { req, res } = createMockReqRes({ withActionBody: false })
    const streamSpy = jest.spyOn(req, 'stream')

    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    global.fetch = fetchMock as unknown as typeof fetch

    const host = parseHostHeader({ host: 'example.com' })

    await createForwardedActionResponse(
      req,
      res,
      host,
      '/b',
      '',
      '00' + 'a'.repeat(40)
    )

    expect(streamSpy).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0]
    const forwardedHeaders = init.headers as Headers
    expect(forwardedHeaders.has(NEXT_RESUME_HEADER)).toBe(true)
    expect(forwardedHeaders.has(NEXT_RESUME_STATE_LENGTH_HEADER)).toBe(true)
  })
})
