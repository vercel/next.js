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
import { printSpanTree, type SpanLink, type TreeSpan } from 'otel-span-tree'

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
  /** The span's links (`end` events). */
  links?: SpanLink[]
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
      links: end.links,
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

export interface SpanGroup {
  /** The traces of a request (e.g. the middleware's and the render's). */
  traceIds: string[]
  /**
   * The `next.span_type`s of spans (with multiplicity) that must have ended
   * before the capture is complete, e.g. the middleware span and the render's
   * request span.
   */
  expected: string[]
}

export interface CollectOptions {
  /** How long to wait for a complete capture. */
  timeoutMs: number
  /** Delay before the poll that confirms a complete capture didn't change. */
  settleMs: number
  /** Delay between polls of an incomplete capture. */
  pollIntervalMs: number
  /** Called with every captured span event line (once per event). */
  log?: (message: string) => void
}

export type CollectSpansOptions = SpanGroup & CollectOptions

/** The spans of a request, or why they couldn't be captured. */
export type SpanGroupResult = { spans: TreeSpan[] } | { error: Error }

interface GroupState {
  group: SpanGroup
  spans: TreeSpan[]
  missing: string[]
  notEnded: TreeSpan[]
  history: string[]
  /**
   * The number of the group's events, and when, when its capture was found
   * complete (to confirm, with a poll at least `settleMs` later, that no
   * events were added).
   */
  complete?: { events: number; at: number }
  /** Set when a poll confirmed the complete capture. */
  settled: boolean
  /** Set when the capture failed for good (a span was ended twice). */
  error?: Error
}

function isComplete(state: GroupState) {
  return (
    state.error === undefined &&
    state.missing.length === 0 &&
    state.notEnded.length === 0
  )
}

function diagnostic(state: GroupState, reason: string) {
  return new Error(
    [
      reason,
      `Missing expected spans: [${state.missing.join(', ')}]`,
      `Spans that haven't ended: [${state.notEnded.map((span) => `${span.name} (${span.type ?? 'no type'})`).join(', ')}]`,
      'Captured so far:',
      printSpanTree(state.spans) || '(none)',
      'Polls:',
      ...state.history,
    ].join('\n')
  )
}

/**
 * Polls `read` (span event output, which may repeat events of earlier reads,
 * or no longer include them) until the capture of every group (e.g. one per
 * request) is complete: every expected span has ended, every span that
 * started has ended, and one more poll after `settleMs` finds no new events.
 * All groups share the polls (one `read` per poll), and the events of all
 * polls are kept. Spans whose parents weren't captured are allowed (an
 * incoming `traceparent`, a host span, another process). Settling can't prove
 * that no log line arrives later (log delivery can be delayed or lose lines),
 * but the expected spans must be there.
 *
 * `read` gets the deadline of the whole capture (a `Date.now()` timestamp). A
 * failed read (e.g. a `vercel logs` error) is recorded in the poll history
 * and retried with the next poll.
 *
 * Returns a result per group: its spans, or an error with a diagnostic (the
 * tree so far, with spans that haven't ended badged, the missing expected
 * spans and the poll history) when its capture isn't complete, or wasn't
 * confirmed by a later poll, within `timeoutMs`, or when one of its spans was
 * ended more than once.
 */
export async function collectSpanEventGroups(
  read: (deadline: number) => Promise<string>,
  {
    groups,
    timeoutMs,
    settleMs,
    pollIntervalMs,
    log,
  }: CollectOptions & { groups: SpanGroup[] }
): Promise<SpanGroupResult[]> {
  const deadline = Date.now() + timeoutMs
  const traceIds = new Set(groups.flatMap((group) => group.traceIds))
  const events = new Map<string, SpanEvent>()
  const states: GroupState[] = groups.map((group) => ({
    group,
    spans: [],
    missing: group.expected,
    notEnded: [],
    history: [],
    settled: false,
  }))
  // Whether the delay before this poll was `settleMs` (timers can fire a bit
  // early, so elapsed time alone isn't enough to tell).
  let settleWaited = false

  for (let poll = 1; ; poll++) {
    let output: string | undefined
    try {
      output = await read(deadline)
    } catch (error) {
      for (const state of states) {
        state.history.push(`poll ${poll}: reading failed: ${error}`)
      }
    }

    if (output !== undefined) {
      const parsed = parseSpanEvents(output)
      for (const event of parsed.events) {
        if (traceIds.has(event.traceId) && !events.has(event.eventId)) {
          events.set(event.eventId, event)
          log?.(`${SPAN_EVENT_MARKER} ${JSON.stringify(event)}`)
        }
      }
      for (const state of states) {
        // Groups that already settled are checked again while others are
        // still collected: an event that arrives later (e.g. a second `end`
        // event, or a span that started) still counts.
        if (state.error) {
          continue
        }
        const merged = mergeSpanEvents(events.values(), state.group.traceIds)
        const groupEvents = [...events.values()].filter((event) =>
          state.group.traceIds.includes(event.traceId)
        ).length
        state.spans = merged.spans
        state.missing = getMissing(state.spans, state.group.expected)
        state.notEnded = state.spans.filter((span) => !span.ended)
        state.history.push(
          `poll ${poll}: ${state.spans.length} span(s), ${state.notEnded.length} not ended, missing [${state.missing.join(', ')}]` +
            (parsed.malformed ? `, ${parsed.malformed} malformed line(s)` : '')
        )
        if (merged.duplicateEnds.length > 0) {
          state.error = diagnostic(
            state,
            `Spans ended more than once: [${merged.duplicateEnds.join(', ')}]`
          )
        } else if (isComplete(state)) {
          if (state.complete?.events === groupEvents) {
            state.settled =
              state.settled ||
              settleWaited ||
              Date.now() - state.complete.at >= settleMs
          } else {
            state.complete = { events: groupEvents, at: Date.now() }
            state.settled = false
          }
        } else {
          state.complete = undefined
          state.settled = false
        }
      }
    }

    if (states.every((state) => state.error || state.settled)) {
      break
    }
    // Once every capture is complete, confirm it after `settleMs`.
    const delay = states.every((state) => state.error || isComplete(state))
      ? settleMs
      : pollIntervalMs
    if (Date.now() + delay > deadline) {
      break
    }
    settleWaited = delay === settleMs
    await sleep(delay)
  }

  return states.map((state) => {
    if (state.error) {
      return { error: state.error }
    }
    if (state.settled) {
      return { spans: state.spans }
    }
    return {
      error: diagnostic(
        state,
        isComplete(state)
          ? `The spans of trace(s) ${state.group.traceIds.join(', ')} were captured, but no later poll confirmed that no more were added within ${timeoutMs}ms.`
          : `The spans of trace(s) ${state.group.traceIds.join(', ')} weren't completely captured within ${timeoutMs}ms.`
      ),
    }
  })
}

/**
 * Collects the spans of one group (see `collectSpanEventGroups`). Throws the
 * diagnostic when the capture is incomplete.
 */
export async function collectSpanEvents(
  read: (deadline: number) => Promise<string>,
  { traceIds, expected, ...options }: CollectSpansOptions
): Promise<TreeSpan[]> {
  const [result] = await collectSpanEventGroups(read, {
    ...options,
    groups: [{ traceIds, expected }],
  })
  if ('error' in result) {
    throw result.error
  }
  return result.spans
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
 * Collects the spans of several requests at once (see
 * `collectSpanEventGroups`), from the server output (self-hosted) or the
 * deployment's runtime logs (deployed, from `since`, which should be a bit
 * before the first request, to allow for clock differences). Deployed, every
 * poll reads the runtime logs of the whole deployment once (filtered by trace
 * locally), and every `vercel logs` call and captured span event is logged to
 * the test output, so the data behind a tree is in the logs of every run.
 */
export async function collectSpanGroups(
  next: NextInstance,
  { groups, since }: { groups: SpanGroup[]; since: Date }
): Promise<SpanGroupResult[]> {
  if (isDeployInstance(next)) {
    const log = (message: string) =>
      require('console').log(`[otel-span-capture] ${message}`)
    log(
      `Collecting the spans of ${groups.length} request(s), trace(s) ${groups.flatMap((group) => group.traceIds).join(', ')}`
    )
    return collectSpanEventGroups(
      (deadline) => next.getRuntimeLogs({ since, deadline }),
      {
        groups,
        // Runtime logs take a while to become available.
        timeoutMs: 360_000,
        settleMs: 15_000,
        pollIntervalMs: 10_000,
        log,
      }
    )
  }
  return collectSpanEventGroups(async () => next.cliOutput, {
    groups,
    timeoutMs: 15_000,
    settleMs: 250,
    pollIntervalMs: 100,
  })
}

/**
 * Collects the spans of a request (see `collectSpanGroups`). Throws the
 * diagnostic when the capture is incomplete.
 */
export async function collectSpans(
  next: NextInstance,
  {
    traceIds,
    expected,
    since,
  }: { traceIds: string[]; expected: string[]; since: Date }
): Promise<TreeSpan[]> {
  const [result] = await collectSpanGroups(next, {
    groups: [{ traceIds, expected }],
    since,
  })
  if ('error' in result) {
    throw result.error
  }
  return result.spans
}
