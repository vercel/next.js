import fs from 'fs'
import path from 'path'
import { filterInternalHeaders } from './utils'

/**
 * The headers that must never be honored from an external request.
 *
 * Deliberately duplicated here instead of imported from `./utils`, so that
 * removing a name from `INTERNAL_HEADERS` fails this test instead of silently
 * shrinking both sides of the assertion.
 */
const EXPECTED_INTERNAL_HEADERS = [
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
  'x-nextjs-data',
  'x-next-internal-go-token',
  'x-next-resume-state-length',
  'next-resume',
]

function headersFrom(names: string[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of names) {
    headers[name] = `forged-${name}`
  }
  return headers
}

describe('filterInternalHeaders', () => {
  it('deletes every internal header and preserves the rest', () => {
    const headers = {
      ...headersFrom(EXPECTED_INTERNAL_HEADERS),
      cookie: 'session=abc',
      authorization: 'Bearer token',
      'user-agent': 'test',
      'x-custom-app-header': 'kept',
    }

    filterInternalHeaders(headers)

    for (const name of EXPECTED_INTERNAL_HEADERS) {
      expect(headers).not.toHaveProperty(name)
    }
    expect(headers).toEqual({
      cookie: 'session=abc',
      authorization: 'Bearer token',
      'user-agent': 'test',
      'x-custom-app-header': 'kept',
    })
  })

  it('is a no-op on a request with no internal headers', () => {
    const headers = { cookie: 'session=abc', 'x-custom-app-header': 'kept' }
    const before = { ...headers }

    filterInternalHeaders(headers)

    expect(headers).toEqual(before)
  })

  it('is idempotent', () => {
    const headers = {
      ...headersFrom(EXPECTED_INTERNAL_HEADERS),
      cookie: 'session=abc',
    }

    filterInternalHeaders(headers)
    filterInternalHeaders(headers)

    expect(headers).toEqual({ cookie: 'session=abc' })
  })

  it('removes headers in place, so the caller does not need the return value', () => {
    const headers = headersFrom(EXPECTED_INTERNAL_HEADERS)

    expect(filterInternalHeaders(headers)).toBeUndefined()
    expect(Object.keys(headers)).toHaveLength(0)
  })
})

/**
 * The regression this suite exists for: `router-server.ts` has two request
 * entry points, and only the HTTP one filtered internal headers. An upgrade
 * request therefore reached `resolveRoutes()` - and any middleware it invokes -
 * with the `INTERNAL_HEADERS` values supplied by the client, while the
 * identical HTTP request reached it with those values deleted.
 *
 * `upgradeHandler` cannot be instantiated in a unit test (it needs a full
 * router/`initialize()` context), so this asserts the entry-point contract
 * statically: the filter must be the first statement of the handler body.
 */
describe('router-server entry points', () => {
  const routerServerSource = fs.readFileSync(
    path.join(__dirname, '..', 'router-server.ts'),
    'utf8'
  )

  function handlerBody(handlerStart: string): string[] {
    const lines = routerServerSource.split('\n')
    const startIndex = lines.findIndex((line) => line.includes(handlerStart))
    if (startIndex === -1) {
      throw new Error(`could not locate entry point: ${handlerStart}`)
    }
    // Body runs until the handler's closing brace at the same indentation.
    const indent = lines[startIndex].match(/^\s*/)![0].length
    const body: string[] = []
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '}' && line.match(/^\s*/)![0].length === indent) {
        break
      }
      body.push(line)
    }
    return body
  }

  function firstStatement(body: string[]): string {
    return (
      body
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('//'))[0] ?? ''
    )
  }

  it('filters internal headers on the HTTP entry point', () => {
    const body = handlerBody(
      'const requestHandlerInner: WorkerRequestHandler = async (req, res) => {'
    )
    // The HTTP path wraps the call in `if (!process.env.NEXT_PRIVATE_TEST_HEADERS)`.
    expect(body.join('\n')).toContain('filterInternalHeaders(req.headers)')
  })

  it('filters internal headers on the upgrade (WebSocket) entry point', () => {
    const body = handlerBody(
      'const upgradeHandler: WorkerUpgradeHandler = async (req, socket, head) => {'
    )
    expect(firstStatement(body)).toBe('filterInternalHeaders(req.headers)')
  })
})
