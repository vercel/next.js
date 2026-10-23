/**
 * Collects the spans of a request from span lifecycle events written to the
 * console, so tests can check finished spans (with their times) after the
 * response, self-hosted and deployed alike.
 *
 * A fixture's span processor writes one line per event, the marker followed by
 * a JSON object (see `SpanEvent`): a `start` event when a span starts and an
 * `end` event when it ends. Self-hosted, the lines are read from the server
 * output (`next.cliOutput`, including the Edge sandbox). Deployed, they are
 * read from the deployment's runtime logs (`vercel logs`, all functions,
 * including middleware).
 */
import { setTimeout as sleep } from 'timers/promises'
import type { NextInstance } from 'e2e-utils'
import { printSpanTree, type TreeSpan } from 'otel-span-tree'

export const SPAN_EVENT_MARKER = '[otel-span]'

/** A span lifecycle event, as written by a fixture's span processor. */
export interface SpanEvent {
  /**
   * Unique per event written, so redeliveries of an event (e.g. the same log
   * line in several reads) can be told apart from distinct events.
   */
  eventId: string
  event: 'start' | 'end'
  traceId: string
  id: string
  parentId?: string
  name: string
  /** The `next.span_type` attribute. */
  type?: string
  /** The printed attributes (`end` events). */
  attributes?: Record<string, string | number | boolean>
  /** In microseconds since the epoch (an integer). */
  startTime: number
  /** In microseconds since the epoch (`end` events). */
  endTime?: number
}

function isSpanEvent(value: unknown): value is SpanEvent {
  const event = value as SpanEvent
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof event.eventId === 'string' &&
    (event.event === 'start' || event.event === 'end') &&
    typeof event.traceId === 'string' &&
    typeof event.id === 'string' &&
    typeof event.name === 'string' &&
    typeof event.startTime === 'number' &&
    (event.event === 'start' || typeof event.endTime === 'number')
  )
}

/**
 * The span events in `text` (any other output is ignored). Returns the number
 * of marker lines that couldn't be parsed too (e.g. a line still being
 * written).
 */
export function parseSpanEvents(text: string): {
  events: SpanEvent[]
  malformed: number
} {
  const events: SpanEvent[] = []
  let malformed = 0
  for (const line of text.split('\n')) {
    const index = line.indexOf(SPAN_EVENT_MARKER)
    if (index === -1) {
      continue
    }
    try {
      const value = JSON.parse(
        line.slice(index + SPAN_EVENT_MARKER.length).trim()
      )
      if (isSpanEvent(value)) {
        events.push(value)
      } else {
        malformed++
      }
    } catch {
      malformed++
    }
  }
  return { events, malformed }
}

/**
 * Merges the events of the given traces into one span per span ID, in any
 * order, collapsing redeliveries of an event (same event ID). A span may be
 * started several times (e.g. in several processes), but ending a span more
 * than once is an error: such spans are returned in `duplicateEnds`. A span
 * with only `start` events hasn't ended (`ended: false`).
 */
export function mergeSpanEvents(
  events: Iterable<SpanEvent>,
  traceIds: Iterable<string>
): { spans: TreeSpan[]; duplicateEnds: string[] } {
  const traces = new Set(traceIds)
  const unique = new Map<string, SpanEvent>()
  for (const event of events) {
    if (traces.has(event.traceId) && !unique.has(event.eventId)) {
      unique.set(event.eventId, event)
    }
  }
  const starts = new Map<string, SpanEvent>()
  const ends = new Map<string, SpanEvent>()
  const duplicateEnds = new Set<string>()
  for (const event of unique.values()) {
    if (event.event === 'end') {
      if (ends.has(event.id)) {
        duplicateEnds.add(event.id)
      } else {
        ends.set(event.id, event)
      }
    } else if (!starts.has(event.id)) {
      starts.set(event.id, event)
    }
  }
  const spans: TreeSpan[] = []
  for (const [id, end] of ends) {
    spans.push({
      id,
      parentId: end.parentId,
      traceId: end.traceId,
      name: end.name,
      type: end.type,
      attributes: end.attributes,
      startTime: end.startTime,
      endTime: end.endTime,
      ended: true,
    })
  }
  for (const [id, start] of starts) {
    if (!ends.has(id)) {
      spans.push({
        id,
        parentId: start.parentId,
        traceId: start.traceId,
        name: start.name,
        type: start.type,
        startTime: start.startTime,
        ended: false,
      })
    }
  }
  return { spans, duplicateEnds: [...duplicateEnds] }
}

/** The expected span types (with multiplicity) that haven't ended yet. */
function getMissing(spans: TreeSpan[], expected: string[]) {
  const ended = spans.filter((span) => span.ended)
  const missing: string[] = []
  const used = new Set<TreeSpan>()
  for (const type of expected) {
    const match = ended.find((span) => span.type === type && !used.has(span))
    if (match) {
      used.add(match)
    } else {
      missing.push(type)
    }
  }
  return missing
}

export interface CollectSpansOptions {
  /** The traces of the request (e.g. the middleware's and the render's). */
  traceIds: string[]
  /**
   * The `next.span_type`s of spans (with multiplicity) that must have ended
   * before the capture is complete, e.g. the middleware span and the render's
   * request span.
   */
  expected: string[]
  /** How long to wait for a complete capture. */
  timeoutMs: number
  /** Delay before the poll that confirms a complete capture didn't change. */
  settleMs: number
  /** Delay between polls of an incomplete capture. */
  pollIntervalMs: number
}

/**
 * Polls `read` (span event output, which may repeat events of earlier reads,
 * or no longer include them) until the capture of the given traces is
 * complete: every expected span has ended, every span that started has
 * ended, and one more poll after `settleMs` finds no new events. The events
 * of all polls are kept. Spans whose parents weren't captured are allowed (an
 * incoming `traceparent`, a host span, another process). Settling can't prove
 * that no log line arrives later (log delivery can be delayed or lose lines),
 * but the expected spans must be there.
 *
 * `read` gets the deadline of the whole capture (a `Date.now()` timestamp).
 * Throws with a diagnostic (the tree so far, with spans that haven't ended
 * badged, the missing expected spans and the poll history) when the capture
 * isn't complete within `timeoutMs`, when a span was ended more than once, or
 * when `read` fails.
 */
export async function collectSpanEvents(
  read: (deadline: number) => Promise<string>,
  {
    traceIds,
    expected,
    timeoutMs,
    settleMs,
    pollIntervalMs,
  }: CollectSpansOptions
): Promise<TreeSpan[]> {
  const deadline = Date.now() + timeoutMs
  const history: string[] = []
  const events = new Map<string, SpanEvent>()
  let completeSize: number | undefined
  let spans: TreeSpan[] = []
  let missing: string[] = expected
  let notEnded: TreeSpan[] = []

  const diagnostic = (reason: string) =>
    [
      reason,
      `Missing expected spans: [${missing.join(', ')}]`,
      `Spans that haven't ended: [${notEnded.map((span) => `${span.name} (${span.type ?? 'no type'})`).join(', ')}]`,
      'Captured so far:',
      printSpanTree(spans) || '(none)',
      'Polls:',
      ...history,
    ].join('\n')

  for (let poll = 1; ; poll++) {
    let output: string
    try {
      output = await read(deadline)
    } catch (error) {
      throw new Error(
        diagnostic(
          `Reading the spans of trace(s) ${traceIds.join(', ')} failed: ${error}`
        )
      )
    }
    const parsed = parseSpanEvents(output)
    for (const event of parsed.events) {
      if (traceIds.includes(event.traceId) && !events.has(event.eventId)) {
        events.set(event.eventId, event)
      }
    }
    const merged = mergeSpanEvents(events.values(), traceIds)
    spans = merged.spans
    missing = getMissing(spans, expected)
    notEnded = spans.filter((span) => !span.ended)
    history.push(
      `poll ${poll}: ${spans.length} span(s), ${notEnded.length} not ended, missing [${missing.join(', ')}]` +
        (parsed.malformed ? `, ${parsed.malformed} malformed line(s)` : '')
    )
    if (merged.duplicateEnds.length > 0) {
      throw new Error(
        diagnostic(
          `Spans ended more than once: [${merged.duplicateEnds.join(', ')}]`
        )
      )
    }

    if (missing.length === 0 && notEnded.length === 0) {
      if (events.size === completeSize) {
        return spans
      }
      completeSize = events.size
      if (Date.now() + settleMs > deadline) {
        break
      }
      await sleep(settleMs)
      continue
    }
    completeSize = undefined

    if (Date.now() + pollIntervalMs > deadline) {
      break
    }
    await sleep(pollIntervalMs)
  }

  throw new Error(
    diagnostic(
      `The spans of trace(s) ${traceIds.join(', ')} weren't completely captured within ${timeoutMs}ms.`
    )
  )
}

interface DeployInstance {
  getRuntimeLogs(options: {
    since: Date
    query?: string
    deadline: number
  }): Promise<string>
}

function isDeployInstance(
  next: NextInstance
): next is NextInstance & DeployInstance {
  return typeof (next as Partial<DeployInstance>).getRuntimeLogs === 'function'
}

/**
 * Collects the spans of a request (see `collectSpanEvents`) from the server
 * output (self-hosted) or the deployment's runtime logs (deployed, from
 * `since`, which should be a bit before the request, to allow for clock
 * differences).
 */
export async function collectSpans(
  next: NextInstance,
  {
    traceIds,
    expected,
    since,
  }: { traceIds: string[]; expected: string[]; since: Date }
): Promise<TreeSpan[]> {
  if (isDeployInstance(next)) {
    return collectSpanEvents(
      async (deadline) =>
        (
          await Promise.all(
            traceIds.map((traceId) =>
              next.getRuntimeLogs({ since, query: traceId, deadline })
            )
          )
        ).join('\n'),
      {
        traceIds,
        expected,
        // Runtime logs take a while to become available.
        timeoutMs: 180_000,
        settleMs: 10_000,
        pollIntervalMs: 5_000,
      }
    )
  }
  return collectSpanEvents(async () => next.cliOutput, {
    traceIds,
    expected,
    timeoutMs: 15_000,
    settleMs: 250,
    pollIntervalMs: 100,
  })
}
