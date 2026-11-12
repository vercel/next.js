import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync } from 'fs'
import { retry } from 'next-test-utils'
import {
  expectTraceEventContract,
  parseTraceFile,
} from '../../../lib/parse-trace-file'

describe('render-path tracing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `node node_modules/next/dist/bin/next ${process.env.IS_WEBPACK_TEST ? '--webpack' : '--turbopack'}`,
    env: {
      // Give the child time to flush response-close spans before SIGKILL.
      NEXT_EXIT_TIMEOUT_MS: '30000',
    },
  })

  it('records startup, compilation and backdated request spans across an edit', async () => {
    const requestStartedAt = Date.now()
    expect((await next.render$('/'))('p').text()).toBe('hello world')

    const browser = await next.browser('/')
    await browser.eval(`
      window.__toolingHmrDocument = true
      window.__NEXT_HMR_LATENCY_CB = (latency) => {
        window.__toolingHmrLatency = latency
      }
    `)
    const editStartedAt = Date.now()
    await next.patchFile('app/page.tsx', (content) =>
      content.replace('hello world', 'hello after edit')
    )
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('hello after edit')
      expect(await browser.eval('window.__toolingHmrDocument')).toBe(true)
      expect(await browser.eval('window.__toolingHmrLatency')).toEqual(
        expect.any(Number)
      )
    })
    const editFinishedAt = Date.now()
    const clientLatency = await browser.eval('window.__toolingHmrLatency')
    await browser.close()
    expect((await next.render$('/'))('p').text()).toBe('hello after edit')
    expect((await next.render$('/slow'))('p').text()).toBe('slow page')
    const requestFinishedAt = Date.now()

    // File existence alone is not evidence of request tracing: it may already
    // contain compilation spans. Stopping also flushes the response-close tail.
    await next.stop('SIGTERM')
    const { events, eventsByName } = parseTraceFile(
      join(next.testDir, '.next/dev/trace')
    )
    expectTraceEventContract(events)
    expect(existsSync(join(next.testDir, '.next/dev/trace-build'))).toBe(false)

    const startup = eventsByName.get('start-dev-server') ?? []
    expect(startup).toHaveLength(1)
    const sessions = eventsByName.get('dev-server-session') ?? []
    expect(sessions).toHaveLength(1)
    expect(sessions[0].parentId).toBeUndefined()
    expect(startup[0].parentId).toBe(sessions[0].id)
    expect(eventsByName.get('compile-path')?.length).toBeGreaterThan(0)

    const clientEvents = eventsByName.get('client-hmr-latency') ?? []
    expect(clientEvents.length).toBeGreaterThan(0)
    const clientEvent = clientEvents
      .filter(
        (event) =>
          event.tags.page === '/' &&
          event.startTime !== undefined &&
          event.startTime >= editStartedAt - 10 &&
          event.startTime <= editFinishedAt
      )
      .at(-1)!
    expect(clientEvent).toBeDefined()
    expect(clientEvent.duration).toBe(clientLatency * 1000)
    expect(clientEvent.startTime).toBeGreaterThanOrEqual(requestStartedAt - 10)
    expect(clientEvent.startTime).toBeLessThanOrEqual(requestFinishedAt)
    expect(clientEvent.tags).toMatchObject({
      page: '/',
      isPageHidden: expect.any(Boolean),
    })
    expect(Object.keys(clientEvent.tags).sort()).toEqual([
      'isPageHidden',
      'page',
      'updatedModules',
    ])
    expect(
      events.find((event) => event.id === clientEvent.parentId)?.name
    ).toBe('hot-reloader')
    expect(clientEvent.traceId).toBe(startup[0].traceId)

    const slowRender = eventsByName
      .get('render-path')
      ?.find((event) => event.tags?.path === '/slow')
    expect(slowRender).toBeDefined()
    // A deliberately delayed render distinguishes microseconds from ms/ns.
    expect(slowRender!.duration).toBeGreaterThanOrEqual(150_000)
    expect(slowRender!.duration / 1000).toBeLessThanOrEqual(
      requestFinishedAt - requestStartedAt + 10
    )

    const renderEvents = eventsByName
      .get('render-path')
      ?.filter((event) => event.tags?.path === '/')
    expect(renderEvents?.length).toBeGreaterThanOrEqual(2)
    for (const event of renderEvents!) {
      expect(event.parentId).toBe(startup[0].id)
      expect(event.traceId).toBe(startup[0].traceId)
      expect(event.duration).toBeGreaterThan(0)
      // manualTraceChild must preserve when rendering began, not the time at
      // which the completed request is later recorded/exported.
      expect(event.startTime).toBeGreaterThanOrEqual(requestStartedAt - 10)
      expect(event.startTime).toBeLessThanOrEqual(requestFinishedAt)
      expect(event.duration / 1000).toBeLessThanOrEqual(
        requestFinishedAt - requestStartedAt + 10
      )
    }
  })
})
