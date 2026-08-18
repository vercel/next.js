import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync } from 'fs'
import { parseTraceFile } from '../../../lib/parse-trace-file'

describe('render-path tracing', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  it('should record render-path events for page requests', async () => {
    const tracePath = join(next.testDir, '.next/dev/trace')

    // Trigger page request if trace doesn't exist yet
    if (!existsSync(tracePath)) {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      await browser.close()
      await next.stop('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const traceStructure = parseTraceFile(tracePath)

    // Check for render-path events
    const renderPathEvents = traceStructure.eventsByName.get('render-path')
    expect(renderPathEvents).toBeDefined()
    expect(renderPathEvents!.length).toBeGreaterThan(0)

    // Verify the first render-path event has expected attributes
    const renderEvent = renderPathEvents![0]
    expect(renderEvent.tags).toBeDefined()
    const renderTags = renderEvent.tags as any

    expect(renderTags.path).toBeDefined()
    expect(typeof renderTags.path).toBe('string')

    // Verify render event has valid duration
    expect(renderEvent.duration).toBeGreaterThan(0)
  })
})
