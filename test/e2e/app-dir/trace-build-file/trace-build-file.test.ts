import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

type SpanId = number

type TraceEvent = {
  traceId?: string
  parentId?: SpanId
  name: string
  id: SpanId
  timestamp: number
  duration: number
  tags?: Object
  startTime?: number
}

interface TraceStructure {
  events: TraceEvent[]
  eventsByName: Map<string, TraceEvent[]>
  eventsById: Map<string, TraceEvent>
  rootEvents: TraceEvent[]
  orphanedEvents: TraceEvent[]
}

function parseTraceFile(traceBuildPath: string): TraceStructure {
  const traceContent = readFileSync(traceBuildPath, 'utf8')
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
  const rootEvents: TraceEvent[] = []
  const orphanedEvents: TraceEvent[] = []

  // Index all events
  for (const event of allEvents) {
    if (!eventsByName.has(event.name)) {
      eventsByName.set(event.name, [])
    }
    eventsByName.get(event.name).push(event)
    eventsById.set(event.id.toString(), event)
  }

  // Categorize events as root or orphaned
  for (const event of allEvents) {
    if (!event.parentId) {
      rootEvents.push(event)
    } else if (!eventsById.has(event.parentId.toString())) {
      orphanedEvents.push(event)
    }
  }

  return {
    events: allEvents,
    eventsByName,
    eventsById,
    rootEvents,
    orphanedEvents,
  }
}

describe('trace-build-file', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  if (isNextStart) {
    it('should create .next/trace-build file during production build', async () => {
      // Build the app to trigger trace generation
      await next.build()

      // Check that trace-build file exists
      const traceBuildPath = join(next.testDir, '.next/trace-build')
      expect(existsSync(traceBuildPath)).toBe(true)
    })

    it('should contain high-level build trace events', async () => {
      // Ensure we have a fresh build
      await next.build()

      const traceBuildPath = join(next.testDir, '.next/trace-build')
      expect(existsSync(traceBuildPath)).toBe(true)

      const traceStructure = parseTraceFile(traceBuildPath)

      // Should have events
      expect(traceStructure.events.length).toBeGreaterThan(0)

      // Should contain the main next-build event
      const nextBuildEvents = traceStructure.eventsByName.get('next-build')
      expect(nextBuildEvents).toBeDefined()
      expect(nextBuildEvents.length).toBe(1)

      const nextBuildEvent = nextBuildEvents[0]
      expect(nextBuildEvent).toHaveProperty('name', 'next-build')
      expect(nextBuildEvent).toHaveProperty('traceId')
      expect(nextBuildEvent).toHaveProperty('id')
      expect(nextBuildEvent).toHaveProperty('duration')
      expect(typeof nextBuildEvent.duration).toBe('number')
      expect(typeof nextBuildEvent.traceId).toBe('string')
      expect(typeof nextBuildEvent.id).toBe('number')
    })

    it('should only contain allowlisted events', async () => {
      await next.build()

      const traceBuildPath = join(next.testDir, '.next/trace-build')
      const traceStructure = parseTraceFile(traceBuildPath)

      // const allowlistedEvents = new Set([
      //   'next-build',
      //   'run-turbopack',
      //   'run-webpack',
      //   'run-typescript',
      //   'run-eslint',
      //   'static-check',
      //   'static-generation',
      //   'output-export-full-static-export',
      // ])

      const foundEvents = new Set<string>()

      for (const event of traceStructure.events) {
        foundEvents.add(event.name)
      }

      if (process.env.IS_TURBOPACK_TEST) {
        expect([...foundEvents].sort()).toMatchInlineSnapshot(`
                [
                  "next-build",
                  "run-turbopack",
                  "run-typescript",
                  "static-check",
                  "static-generation",
                  "telemetry-flush",
                ]
              `)
      } else {
        expect([...foundEvents].sort()).toMatchInlineSnapshot(`
         [
           "collect-build-traces",
           "next-build",
           "run-typescript",
           "run-webpack",
           "static-check",
           "static-generation",
           "telemetry-flush",
         ]
        `)
      }
    })

    it('should have next-build as root span with proper hierarchy', async () => {
      await next.build()

      const traceBuildPath = join(next.testDir, '.next/trace-build')
      const traceStructure = parseTraceFile(traceBuildPath)

      // Should have no orphaned events (all events should have valid parent references)
      expect(traceStructure.orphanedEvents).toHaveLength(0)

      // Should have at one root event
      expect(traceStructure.rootEvents.length).toBe(1)

      // next-build should be the main root event
      const nextBuildEvents = traceStructure.eventsByName.get('next-build')
      expect(nextBuildEvents).toBeDefined()
      expect(nextBuildEvents.length).toBe(1)

      const nextBuildEvent = nextBuildEvents[0]
      expect(nextBuildEvent.parentId).toBeUndefined() // Should be root
      expect(traceStructure.rootEvents).toContain(nextBuildEvent)

      // Other build events should be children of next-build or have valid parent references
      const buildEvents = ['run-webpack', 'run-typescript', 'run-eslint']
      for (const eventName of buildEvents) {
        const events = traceStructure.eventsByName.get(eventName)
        if (events && events.length > 0) {
          for (const event of events) {
            if (event.parentId) {
              // Should have a valid parent
              expect(
                traceStructure.eventsById.has(event.parentId.toString())
              ).toBe(true)
              const parent = traceStructure.eventsById.get(
                event.parentId.toString()
              )

              // Parent should either be next-build or another valid event
              expect(parent).toBeDefined()
              expect(parent.traceId).toBe(event.traceId) // Same trace
            }
          }
        }
      }
    })

    it('should have consistent traceId across all events', async () => {
      await next.build()

      const traceBuildPath = join(next.testDir, '.next/trace-build')
      const traceStructure = parseTraceFile(traceBuildPath)

      expect(traceStructure.events.length).toBeGreaterThan(0)

      const firstEvent = traceStructure.events[0]
      expect(firstEvent.traceId).toBeDefined()
      expect(typeof firstEvent.traceId).toBe('string')
      expect(firstEvent.traceId.length).toBeGreaterThan(0)

      // All events should have the same traceId
      for (const event of traceStructure.events) {
        expect(event.traceId).toBe(firstEvent.traceId)
      }
    })
  }

  if (isNextDev) {
    it('should not create trace-build file in development mode', async () => {
      // Make a request to trigger some activity
      await next.render('/')

      // Check that trace-build file does not exist
      const traceBuildPath = join(next.testDir, '.next/trace-build')
      expect(existsSync(traceBuildPath)).toBe(false)
    })
  }

  it('should work with basic page rendering', async () => {
    if (isNextStart) {
      await next.start()
    }
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
