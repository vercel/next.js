import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { retry } from 'next-test-utils'

type RequestInsight = {
  requestId: string
  htmlRequestId: string
  route: string
  startTime: number
  status: 'ok'
  spans: Array<{
    attributes?: Record<string, string | number | boolean>
  }>
  fetches: Array<{
    durationMs: number
    statusCode: number
    cacheStatus: string
    method: string
    url: string
  }>
}

describe('request insights', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function createRequest(index: number, fetchCount = 0): RequestInsight {
    return {
      requestId: `request-${index}`,
      htmlRequestId: `page-${index}`,
      route: `/route-${index}`,
      startTime: index,
      status: 'ok',
      spans: [],
      fetches: Array.from({ length: fetchCount }, (_, fetchIndex) => ({
        durationMs: fetchIndex + 1,
        statusCode: 200,
        cacheStatus: 'miss',
        method: 'GET',
        url: `https://example.com/fetch-${fetchIndex}`,
      })),
    }
  }

  async function runWithResponse(body: unknown, args: string[] = []) {
    const requestedPaths: string[] = []
    const server = createServer((req, res) => {
      requestedPaths.push(req.url ?? '')
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address() as AddressInfo
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        `http://127.0.0.1:${address.port}`,
        ...args,
      ])
      return { result, requestedPaths }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }

  it('discovers the running dev server from the project lockfile', async () => {
    const result = await next.runCommand(['experimental-request-insights'])

    if (result.code !== 0) {
      throw new Error(result.cliOutput)
    }
    expect(result.cliOutput).toMatch(
      /No request insights captured yet|retained requests \(newest first\)/
    )
  })

  it('keeps outer server and app render spans on the same request', async () => {
    await next.render('/')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const pageRequests = snapshot.requests.filter(
        (request) => request.route === '/'
      )
      const requestsWithRelevantSpans = pageRequests.filter((request) =>
        request.spans.some((span) => {
          const spanType = span.attributes?.['next.span_type']
          return (
            spanType === 'BaseServer.handleRequest' ||
            spanType === 'AppRender.getBodyResult'
          )
        })
      )

      expect(requestsWithRelevantSpans).toHaveLength(1)
      expect(
        requestsWithRelevantSpans[0].spans.map(
          (span) => span.attributes?.['next.span_type']
        )
      ).toEqual(
        expect.arrayContaining([
          'BaseServer.handleRequest',
          'AppRender.getBodyResult',
        ])
      )
    })
  })

  it('uses the development endpoint and reports truncated output', async () => {
    const { result, requestedPaths } = await runWithResponse(
      {
        requests: [createRequest(1), createRequest(2), createRequest(3, 7)],
      },
      ['--limit', '1']
    )

    expect(result.code).toBe(0)
    expect(requestedPaths).toEqual(['/_next/development/request-insights'])
    expect(result.stdout).toContain(
      'Showing 1 of 3 retained requests (newest first).'
    )
    expect(result.stdout).toContain('/route-3')
    expect(result.stdout).not.toContain('/route-2')
    expect(result.stdout).toContain('showing first 5 of 7 fetches')
    expect(result.stdout).toContain('https://example.com/fetch-4')
    expect(result.stdout).not.toContain('https://example.com/fetch-5')
  })

  it.each(['localhost:3000', 'https://[', 'ftp://localhost:3000'])(
    'rejects invalid dev server URL %s',
    async (url) => {
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        url,
      ])

      expect(result.code).toBe(1)
      expect(result.stderr).toContain(
        `Invalid dev server URL "${url}". Pass a valid HTTP or HTTPS URL.`
      )
    }
  )

  it.each([
    { body: { requests: null }, args: ['--json'] },
    { body: { requests: [{ fetches: null }] }, args: [] },
  ])('rejects malformed responses', async ({ body, args }) => {
    const { result } = await runWithResponse(body, args)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'expected requests and fetches to be arrays'
    )
  })
})
