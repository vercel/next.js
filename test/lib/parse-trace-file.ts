import { readFileSync } from 'fs'
import type { TraceEvent } from 'next/dist/trace'

export interface TraceStructure {
  events: TraceEvent[]
  eventsByName: Map<string, TraceEvent[]>
  eventsById: Map<string, TraceEvent>
  rootEvents: TraceEvent[]
  orphanedEvents: TraceEvent[]
}

/**
 * Parses a Next.js trace file (e.g. `.next/trace` or `.next/trace-build`)
 * and returns the flat list of trace events.
 */
export function parseTraceEvents(tracePath: string): TraceEvent[] {
  const traceContent = readFileSync(tracePath, 'utf8')
  const allEvents: TraceEvent[] = []
  for (const line of traceContent.trim().split('\n')) {
    if (!line.trim()) continue
    allEvents.push(...(JSON.parse(line) as TraceEvent[]))
  }
  return allEvents
}

/**
 * The on-disk tooling trace contract, shared by legacy and OTel-backed e2e tests.
 * Compare within each session: development appends sessions whose numeric IDs
 * can start over, and intentionally filtered/unfinished parents may be absent.
 */
export function expectTraceEventContract(events: TraceEvent[]): void {
  expect(events.length).toBeGreaterThan(0)
  const sessions = new Map<string, TraceEvent[]>()

  for (const event of events) {
    expect(typeof event.name).toBe('string')
    expect(event.name.length).toBeGreaterThan(0)
    expect(Number.isSafeInteger(event.id)).toBe(true)
    expect(event.id).toBeGreaterThan(0)
    if (event.parentId !== undefined) {
      expect(Number.isSafeInteger(event.parentId)).toBe(true)
      expect(event.parentId).toBeGreaterThan(0)
      expect(event.parentId).not.toBe(event.id)
    }
    expect(Number.isSafeInteger(event.timestamp)).toBe(true)
    expect(event.timestamp).toBeGreaterThanOrEqual(0)
    expect(Number.isSafeInteger(event.duration)).toBe(true)
    expect(event.duration).toBeGreaterThanOrEqual(0)
    expect(Number.isSafeInteger(event.startTime)).toBe(true)
    expect(event.startTime).toBeGreaterThan(1_000_000_000_000)
    // `timestamp` is monotonic microseconds, not epoch microseconds.
    expect(event.timestamp).toBeLessThan(event.startTime! * 1000)
    expect(event.tags).toEqual(expect.any(Object))
    expect(typeof event.traceId).toBe('string')
    expect(event.traceId!.length).toBeGreaterThan(0)
    const session = sessions.get(event.traceId!) ?? []
    session.push(event)
    sessions.set(event.traceId!, session)
  }

  for (const session of sessions.values()) {
    expect(new Set(session.map((event) => event.id)).size).toBe(session.length)
    const reference = session[0]
    for (const event of session) {
      // The independent wall clock is only millisecond precision. This also
      // catches accidentally reporting a timestamp in ms instead of µs.
      const wallDeltaUs = (event.startTime! - reference.startTime!) * 1000
      const monotonicDeltaUs = event.timestamp - reference.timestamp
      expect(Math.abs(wallDeltaUs - monotonicDeltaUs)).toBeLessThan(10_000)
    }
  }
}

/**
 * Parses a Next.js trace file and returns a structured representation
 * with events indexed by name and id, plus root/orphaned classification.
 */
export function parseTraceFile(tracePath: string): TraceStructure {
  const allEvents = parseTraceEvents(tracePath)

  const eventsByName = new Map<string, TraceEvent[]>()
  const eventsById = new Map<string, TraceEvent>()
  const rootEvents: TraceEvent[] = []
  const orphanedEvents: TraceEvent[] = []

  for (const event of allEvents) {
    const byName = eventsByName.get(event.name)
    if (byName) {
      byName.push(event)
    } else {
      eventsByName.set(event.name, [event])
    }
    eventsById.set(event.id.toString(), event)
  }

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
