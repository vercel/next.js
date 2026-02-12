import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { TraceEvent } from 'next/dist/trace'

interface TraceStructure {
  events: TraceEvent[]
  eventsByName: Map<string, TraceEvent[]>
  eventsById: Map<string, TraceEvent>
}

function parseTraceFile(tracePath: string): TraceStructure {
  const traceContent = readFileSync(tracePath, 'utf8')
  const traceLines = traceContent
    .trim()
    .split('\n')
    .filter((line) => line.trim())

  const allEvents: TraceEvent[] = []

  for (const line of traceLines) {
    const events = JSON.parse(line) as TraceEvent[]
    allEvents.push(...events)
  }

  const eventsByName = new Map<string, TraceEvent[]>()
  const eventsById = new Map<string, TraceEvent>()

  // Index all events
  for (const event of allEvents) {
    if (!eventsByName.has(event.name)) {
      eventsByName.set(event.name, [])
    }
    eventsByName.get(event.name)!.push(event)
    eventsById.set(event.id.toString(), event)
  }

  return {
    events: allEvents,
    eventsByName,
    eventsById,
  }
}

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
