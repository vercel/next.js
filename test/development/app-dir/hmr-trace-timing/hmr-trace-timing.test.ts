import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  expectTraceEventContract,
  parseTraceFile,
} from '../../../lib/parse-trace-file'

describe('render-path tracing', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    env: {
      // Give the child time to flush response-close spans before SIGKILL.
      NEXT_EXIT_TIMEOUT_MS: '30000',
    },
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  it('records startup, compilation and backdated request spans across an edit', async () => {
    const requestStartedAt = Date.now()
    expect((await next.render$('/'))('p').text()).toBe('hello world')

    await next.patchFile('app/page.tsx', (content) =>
      content.replace('hello world', 'hello after edit')
    )
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
    expect(startup[0].parentId).toBeUndefined()
    expect(eventsByName.get('compile-path')?.length).toBeGreaterThan(0)

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
