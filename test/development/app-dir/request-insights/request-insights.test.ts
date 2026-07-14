import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { retry } from 'next-test-utils'

type RequestInsight = {
  requestId: string
  htmlRequestId: string
  route: string
  startTime: number
  status: 'ok' | 'error' | 'pending'
  durationMs?: number
  serverAction?: {
    name: string
    file?: string
    durationMs?: number
    status: 'ok' | 'error'
  }
  spans: Array<{
    name: string
    spanId?: string
    parentSpanId?: string
    startTime: number
    durationMs?: number
    status?: 'ok' | 'error'
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

  it('identifies client-dispatched Server Actions without retaining arguments', async () => {
    const browser = await next.browser('/actions')

    await browser.elementById('delayed-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toStartWith(
        'delayed:'
      )
    })
    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const request = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'delayedAction'
    )
    const actionSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.executeServerAction'
    )
    expect(request).toBeDefined()
    expect(request!.route).toBe('/actions')
    expect(request!.serverAction).toEqual({
      name: 'delayedAction',
      file: 'app/actions/actions.ts',
      durationMs: expect.any(Number),
      status: 'ok',
    })
    expect(request!.serverAction!.durationMs).toBeGreaterThanOrEqual(180)
    expect(actionSpan).toEqual(
      expect.objectContaining({
        name: 'AppRender.executeServerAction',
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span.category': 'application',
          'next.span_name': 'run Server Action delayedAction',
          'next.span_type': 'AppRender.executeServerAction',
          'next.server_action.name': 'delayedAction',
          'next.server_action.file': 'app/actions/actions.ts',
        }),
      })
    )
    const serializedRequest = JSON.stringify(request)
    expect(serializedRequest).not.toContain('super-secret-action-argument')
    expect(serializedRequest).not.toContain('actionId')
    expect(request!.serverAction).not.toHaveProperty('args')

    const command = await next.runCommand([
      'experimental-request-insights',
      '--limit',
      '100',
    ])
    expect(command.code).toBe(0)
    expect(command.stdout).toContain('server action delayedAction')
    expect(command.stdout).toContain('app/actions/actions.ts')
    expect(next.cliOutput).not.toContain('└─ ƒ delayedAction')
  })

  it('identifies default, inline, successful control-flow, and failed actions', async () => {
    const browser = await next.browser('/actions')

    await browser.elementById('default-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'default action complete'
      )
    })

    await browser.elementById('inline-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'inline action complete'
      )
    })

    await browser.elementById('error-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'action failed'
      )
    })

    const progressiveBrowser = await next.browser('/actions', {
      disableJavaScript: true,
    })
    await progressiveBrowser.elementById('progressive-action').click()
    await retry(async () => {
      expect(await progressiveBrowser.url()).toBe(
        `${next.url}/actions?progressive=done`
      )
    })

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const defaultRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'default'
    )
    const inlineRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === '<inline action>'
    )
    const errorRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'errorAction'
    )
    const progressiveRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'progressiveAction'
    )

    expect(defaultRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'default',
        file: 'app/actions/actions.ts',
        status: 'ok',
      })
    )
    expect(inlineRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: '<inline action>',
        file: 'app/actions/page.tsx',
        status: 'ok',
      })
    )
    expect(errorRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'errorAction',
        file: 'app/actions/actions.ts',
        status: 'error',
      })
    )
    expect(progressiveRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'progressiveAction',
        file: 'app/actions/actions.ts',
        status: 'ok',
      })
    )
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
