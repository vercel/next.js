import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { TraceEvent, SpanId } from './types'

/**
 * A single event in the Chrome JSON Trace Event Format.
 *
 * See: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
 *
 * We only emit duration begin/end events ('B' / 'E') today, mirroring the
 * algorithm in `scripts/trace-to-event-format.mjs`.
 */
interface ChromeTraceEvent {
  name: string
  cat: string
  ts: number
  ph: 'B' | 'E' | 'M'
  pid: number
  tid: number
  args?: Record<string, unknown>
}

/**
 * The top-level shape accepted by Perfetto / chrome://tracing for the JSON
 * Trace Event Format ("Object Format").
 */
export interface ChromeTraceObject {
  traceEvents: ChromeTraceEvent[]
  otherData?: Record<string, unknown>
}

/**
 * Parsed `TraceEvent` enriched with reconstructed parent/child links so we can
 * walk the span tree in chronological order.
 */
interface SpanNode extends TraceEvent {
  children?: SpanNode[]
  parent?: SpanNode
  packageName?: string | null
}

const cleanFilename = (filename: string): string => {
  if (filename.includes('&absolutePagePath=')) {
    filename =
      'page ' +
      decodeURIComponent(
        filename.replace(/.+&absolutePagePath=/, '').slice(0, -1)
      )
  }
  filename = filename.replace(/.+!(?!$)/, '')
  return filename
}

const getPackageName = (filename: string): string | null => {
  const match = /.+[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(
    cleanFilename(filename)
  )
  return match ? match[1] : null
}

const createEvent = (
  span: SpanNode,
  ph: 'B' | 'E',
  timestamp: number
): ChromeTraceEvent => ({
  name: span.name,
  // Category. We don't collect this for now.
  cat: '-',
  ts: timestamp,
  ph,
  // process id. We don't collect this for now, putting arbitrary numbers.
  pid: 1,
  // thread id. We don't collect this for now, putting arbitrary numbers.
  tid: 10,
  args: span.tags,
})

/**
 * Recursively emit B/E events for `span` and its children into `out`.
 *
 * Mirrors `reportSpanRecursively` from
 * `scripts/trace-to-event-format.mjs`, including the `build-module-*`
 * package-name collapse for noisy module-build spans.
 */
const reportSpanRecursively = (out: ChromeTraceEvent[], span: SpanNode) => {
  const isBuildModule = span.name.startsWith('build-module-')
  if (isBuildModule && span.tags && typeof span.tags.name === 'string') {
    span.packageName = getPackageName(span.tags.name)
    span.tags.name = span.packageName
    if (span.children) {
      const queue = [...span.children]
      span.children = []
      for (const e of queue) {
        if (e.name.startsWith('build-module-')) {
          const childName =
            e.tags && typeof e.tags.name === 'string' ? e.tags.name : ''
          const pkgName = getPackageName(childName)
          if (!span.packageName || pkgName !== span.packageName) {
            span.children.push(e)
          } else if (e.children) {
            queue.push(...e.children)
          }
        }
      }
    }
  }

  out.push(createEvent(span, 'B', span.timestamp))

  // Spans should be reported in chronological order.
  span.children?.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  span.children?.forEach((child) => reportSpanRecursively(out, child))

  out.push(createEvent(span, 'E', span.timestamp + span.duration))
}

/**
 * Summary of a single trace session, identified by its `traceId`. A `.next/
 * trace` file may contain many sessions appended over time (each `next dev`
 * restart, each `next build`, etc.). This is enough metadata for a UI to
 * render one entry per session.
 */
export interface TraceSessionSummary {
  /** The `traceId` shared by every event in this session. */
  traceId: string
  /** The root span's `name` (e.g. `next-dev`, `next-build`). */
  name: string
  /** The earliest `timestamp` (microseconds) seen across the session. */
  startTime: number
  /**
   * Wall-clock time (milliseconds since the Unix epoch) the session started,
   * taken from the root span's `startTime` (which `Span.stop()` populates
   * with `Date.now()`). `null` if no event in the session has one.
   */
  wallClockStartTime: number | null
  /** The session's duration in microseconds, derived from the root span. */
  duration: number
  /** Total number of events that belong to this session. */
  eventCount: number
}

/**
 * Read every line of a `.next/trace` file and yield each parsed event in turn.
 * Centralised here so we have one place that handles malformed lines.
 */
async function* readTraceEvents(
  filePath: string
): AsyncGenerator<TraceEvent, void, void> {
  const readLineInterface = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const line of readLineInterface) {
    if (!line) continue
    const events = JSON.parse(line) as TraceEvent[]
    for (const event of events) {
      yield event
    }
  }
}

/**
 * List the sessions in a `.next/trace` file. Returned in the order their root
 * spans were first observed in the file.
 */
export async function listTraceSessions(
  filePath: string
): Promise<TraceSessionSummary[]> {
  // Track summary per traceId. Events without a `traceId` are bucketed under
  // the empty string so we still expose them as a single "session" rather
  // than dropping them.
  const summaries = new Map<
    string,
    {
      summary: TraceSessionSummary
      // Cached pointer to the root span (parentId === undefined) once we
      // observe one. Until then we fall back to the first event seen.
      rootObserved: boolean
    }
  >()

  for await (const event of readTraceEvents(filePath)) {
    const traceId = event.traceId ?? ''
    let entry = summaries.get(traceId)
    if (!entry) {
      entry = {
        summary: {
          traceId,
          name: event.name,
          startTime: event.timestamp,
          wallClockStartTime: null,
          duration: event.duration,
          eventCount: 0,
        },
        rootObserved: false,
      }
      summaries.set(traceId, entry)
    }

    entry.summary.eventCount += 1
    if (event.timestamp < entry.summary.startTime) {
      entry.summary.startTime = event.timestamp
    }

    // Track the earliest wall-clock time we've seen as a fallback in case no
    // root span surfaces one.
    if (
      typeof event.startTime === 'number' &&
      (entry.summary.wallClockStartTime === null ||
        event.startTime < entry.summary.wallClockStartTime)
    ) {
      entry.summary.wallClockStartTime = event.startTime
    }

    // Prefer the first root span we see for `name`, `duration`, and the
    // wall-clock start time. Trace files usually have at most one root per
    // session, but if multiple show up (e.g. concurrent worker traces), the
    // first one wins.
    if (event.parentId === undefined && !entry.rootObserved) {
      entry.summary.name = event.name
      entry.summary.duration = event.duration
      if (typeof event.startTime === 'number') {
        entry.summary.wallClockStartTime = event.startTime
      }
      entry.rootObserved = true
    }
  }

  return Array.from(summaries.values(), (entry) => entry.summary)
}

/**
 * Read a Next.js `.next/trace` NDJSON file and convert it to the Chrome JSON
 * Trace Event Format that Perfetto / chrome://tracing can ingest natively.
 *
 * The input file contains one JSON-encoded `TraceEvent[]` per line. Events
 * may appear out of order, so we read the entire file before reconstructing
 * the span tree by `parentId` and emitting begin/end events in chronological
 * order.
 *
 * If `traceId` is provided, only events with a matching `traceId` are
 * included in the output. This is how `next internal perfetto` lets users
 * open a single session from a multi-session `.next/dev/trace`.
 */
export async function convertNextTraceToChromeEventFormat(
  filePath: string,
  options: { traceId?: string } = {}
): Promise<ChromeTraceObject> {
  const { traceId: filterTraceId } = options

  const spans = new Map<SpanId, SpanNode>()
  const rootSpans: SpanNode[] = []

  for await (const event of readTraceEvents(filePath)) {
    if (filterTraceId !== undefined && event.traceId !== filterTraceId) {
      continue
    }
    spans.set(event.id, event)
  }

  // Link inner, child spans to their parents.
  for (const span of spans.values()) {
    if (span.parentId !== undefined) {
      const parent = spans.get(span.parentId)
      if (parent) {
        span.parent = parent
        ;(parent.children ??= []).push(span)
      }
    }
    if (!span.parent) {
      rootSpans.push(span)
    }
  }

  const traceEvents: ChromeTraceEvent[] = []
  for (const span of rootSpans) {
    reportSpanRecursively(traceEvents, span)
  }

  return { traceEvents }
}
