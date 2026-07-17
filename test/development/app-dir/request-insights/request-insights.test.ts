import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'

type RequestInsight = {
  requestId: string
  htmlRequestId: string
  route: string
  method: string
  statusCode: number
  isRsc: boolean
  startTime: number
  durationMs: number
  status: 'ok'
  operations: Array<{
    id: number
    parentId?: number
    type: string
    name: string
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
      method: 'GET',
      statusCode: 200,
      isRsc: false,
      startTime: index,
      durationMs: index + 1,
      status: 'ok',
      operations: [],
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

  it('keeps outer server and app render operations in one nested timeline', async () => {
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
      const requestsWithRelevantOperations = pageRequests.filter((request) =>
        request.operations.some(
          (operation) => operation.type === 'BaseServer.handleRequest'
        )
      )

      expect(requestsWithRelevantOperations).toHaveLength(1)
      expect(requestsWithRelevantOperations[0]).toEqual(
        expect.objectContaining({
          method: 'GET',
          statusCode: 200,
          isRsc: false,
          durationMs: expect.any(Number),
          status: 'ok',
        })
      )
      expect(
        requestsWithRelevantOperations[0].operations.map(
          (operation) => operation.type
        )
      ).toEqual(
        expect.arrayContaining([
          'BaseServer.handleRequest',
          'AppRender.getBodyResult',
        ])
      )

      const operations = requestsWithRelevantOperations[0].operations
      const requestOperation = operations.find(
        (operation) => operation.type === 'BaseServer.handleRequest'
      )
      const appRenderOperation = operations.find(
        (operation) => operation.type === 'AppRender.getBodyResult'
      )
      expect(
        isOperationDescendantOf(
          appRenderOperation?.id,
          requestOperation?.id,
          operations
        )
      ).toBe(true)
      expect(requestsWithRelevantOperations[0].fetches).toEqual([
        expect.objectContaining({
          method: 'GET',
          statusCode: 200,
          url: expect.stringMatching(/\/api\/data$/),
        }),
      ])
      expect(
        operations.some((operation) => operation.type === 'AppRender.fetch')
      ).toBe(false)
    })
  })

  it('streams completed requests into the open DevTools panel', async () => {
    const browser = await next.browser('/')

    try {
      await toggleDevToolsIndicatorPopover(browser)
      await browser.elementByCss('[data-request-insights]').click()
      await browser.waitForElementByCss('.request-insights-panel')

      const initialRequestCount = (
        await browser.elementsByCss('.request-insights-row')
      ).length
      const requestCount = 3
      const requestNonce = Date.now()

      await browser.eval(
        async ({ count, nonce }) => {
          await Promise.all(
            Array.from({ length: count }, (_, index) =>
              fetch(`/api/data?live-update=${nonce}-${index}`).then(
                (response) => response.text()
              )
            )
          )
        },
        { count: requestCount, nonce: requestNonce }
      )

      await retry(async () => {
        const currentRequestCount = (
          await browser.elementsByCss('.request-insights-row')
        ).length
        expect(currentRequestCount).toBeGreaterThanOrEqual(
          initialRequestCount + requestCount
        )
      })
    } finally {
      await browser.close()
    }
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
    expect(result.stdout).toContain('GET /route-3')
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
    { body: { requests: [{ operations: [], fetches: null }] }, args: [] },
    { body: { requests: [{ operations: null, fetches: [] }] }, args: [] },
  ])('rejects malformed responses', async ({ body, args }) => {
    const { result } = await runWithResponse(body, args)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'expected requests, operations, and fetches to be arrays'
    )
  })
})

function isOperationDescendantOf(
  operationId: number | undefined,
  ancestorId: number | undefined,
  operations: RequestInsight['operations']
): boolean {
  if (!operationId || !ancestorId) {
    return false
  }

  const operationsById = new Map(
    operations.map((operation) => [operation.id, operation])
  )
  let current = operationsById.get(operationId)
  const visited = new Set<number>()

  while (current?.parentId && !visited.has(current.parentId)) {
    if (current.parentId === ancestorId) {
      return true
    }

    visited.add(current.parentId)
    current = operationsById.get(current.parentId)
  }

  return false
}
