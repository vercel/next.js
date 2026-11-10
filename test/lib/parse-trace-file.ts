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
