/**
 * A request span (`Next.request`) that the middleware reserves but leaves to
 * the render to emit, so that it covers the render too.
 *
 * When middleware runs separately from the render (e.g. when deployed) without
 * any trace context, the middleware adapter inserts a root span for the
 * request, the shared parent of the middleware span and the render. Ending it
 * in the middleware would end it before the render even starts. Instead, the
 * middleware reserves the span's IDs (see `reserveRootSpanIds`) and runs with
 * it as the (non-recording) parent. When the request continues to the app, it
 * forwards its context (`traceparent`) to the render together with a
 * `next-deferred` `tracestate` entry describing it, and the render emits the
 * span with exactly that span ID (see `startSpanWithIds`) once its request
 * handling has settled. Otherwise, the middleware emits it.
 *
 * The entry is versioned: `1;<span ID>;<start time>;<name>;<http.method>;<http.target>`,
 * with the start time in microseconds since the epoch and the other fields
 * percent-encoded. Its span ID binds it to the `traceparent` it is sent with.
 * It isn't signed: an entry a client sends itself is accepted when valid,
 * which only affects trace data.
 *
 * Limitations: the span isn't emitted when no render picks the entry up (e.g.
 * a page served from a cache without invoking a function, or a render that
 * crashes or times out), with an SDK without the internals used here, or when
 * the render's sampler drops it. The middleware's spans then have a parent
 * that is never exported. The middleware's and the render's clocks may
 * differ.
 */

export const DEFERRED_REQUEST_SPAN_KEY = 'next-deferred'
const VERSION = '1'

// W3C Trace Context Level 1 limits.
const MAX_VALUE_LENGTH = 256
const MAX_MEMBERS = 32
const MAX_TRACESTATE_LENGTH = 512
// Longer `tracestate` headers (beyond what any sender must propagate) aren't
// parsed for an entry.
const MAX_PARSED_TRACESTATE_LENGTH = 4096
const MEMBER =
  /^(?:[a-z][_0-9a-z\-*/]{0,255}|[a-z0-9][_0-9a-z\-*/]{0,240}@[a-z][_0-9a-z\-*/]{0,13})=[\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/

// The start time may be ahead of the render's clock by up to a minute (clock
// skew between the middleware and the render), and at most 30 minutes old.
const MAX_AHEAD_MS = 60_000
const MAX_AGE_MS = 30 * 60_000

const TRACEPARENT =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.*)?$/

export interface DeferredRequestSpan {
  /** The span ID of the request span (the `traceparent`'s parent ID). */
  spanId: string
  /** In milliseconds since the epoch. */
  startTime: number
  name: string
  attributes: { 'http.method': string; 'http.target'?: string }
}

/**
 * The `next-deferred` value for `span`, or `undefined` if it can't be encoded
 * within 256 characters (`http.target` is dropped first if needed, or if it
 * can't be encoded).
 */
export function encodeDeferredRequestSpan(
  span: DeferredRequestSpan
): string | undefined {
  let fields: string[]
  try {
    fields = [
      VERSION,
      span.spanId,
      String(Math.floor(span.startTime * 1000)),
      encodeURIComponent(span.name),
      encodeURIComponent(span.attributes['http.method']),
    ]
  } catch {
    // E.g. an unpaired surrogate.
    return undefined
  }
  let target = ''
  try {
    target = encodeURIComponent(span.attributes['http.target'] ?? '')
  } catch {}
  const withTarget = [...fields, target].join(';')
  if (withTarget.length <= MAX_VALUE_LENGTH) {
    return withTarget
  }
  const withoutTarget = [...fields, ''].join(';')
  return withoutTarget.length <= MAX_VALUE_LENGTH ? withoutTarget : undefined
}

// The valid members of a W3C `tracestate`, without later duplicates of a key.
function getMembers(tracestate: string | undefined): string[] {
  const keys = new Set<string>()
  const members: string[] = []
  for (const part of (tracestate ?? '').split(',')) {
    const member = part.trim()
    if (!MEMBER.test(member)) {
      continue
    }
    const key = member.slice(0, member.indexOf('='))
    if (!keys.has(key)) {
      keys.add(key)
      members.push(member)
    }
  }
  return members
}

/**
 * Adds `key=value` to a W3C `tracestate` as its leftmost member, replacing an
 * existing member with that key and dropping invalid members. Members are
 * evicted from the right to keep at most 32 members and 512 characters.
 */
export function addTraceStateEntry(
  tracestate: string | undefined,
  key: string,
  value: string
): string {
  const members = [
    `${key}=${value}`,
    ...getMembers(tracestate).filter((member) => !member.startsWith(`${key}=`)),
  ]
  while (
    members.length > MAX_MEMBERS ||
    (members.length > 1 && members.join(',').length > MAX_TRACESTATE_LENGTH)
  ) {
    members.pop()
  }
  return members.join(',')
}

/**
 * Removes the member with `key` from a W3C `tracestate` (and invalid members),
 * or returns `undefined` if no member is left.
 */
export function removeTraceStateEntry(
  tracestate: string | undefined,
  key: string
): string | undefined {
  const members = getMembers(tracestate).filter(
    (member) => !member.startsWith(`${key}=`)
  )
  return members.length > 0 ? members.join(',') : undefined
}

/**
 * The deferred request span described by the `next-deferred` entry of
 * `tracestate`, if valid: bound to `traceparent` (a valid, sampled trace
 * context), and with a start time at most 30 minutes before and at most a
 * minute after `now` (in milliseconds since the epoch). A start time ahead of
 * `now` is set to `now`.
 */
export function parseDeferredRequestSpan(
  tracestate: string | undefined,
  traceparent: string | undefined,
  now: number
): (DeferredRequestSpan & { traceId: string }) | undefined {
  const match = traceparent ? TRACEPARENT.exec(traceparent.trim()) : null
  if (
    !match ||
    !tracestate ||
    tracestate.length > MAX_PARSED_TRACESTATE_LENGTH
  ) {
    return undefined
  }
  const [, version, traceId, parentId, flags] = match
  if (
    version === 'ff' ||
    (version === '00' && traceparent!.trim().length !== 55) ||
    /^0+$/.test(traceId) ||
    /^0+$/.test(parentId) ||
    (parseInt(flags, 16) & 1) !== 1
  ) {
    return undefined
  }

  const prefix = `${DEFERRED_REQUEST_SPAN_KEY}=`
  const member = getMembers(tracestate).find((m) => m.startsWith(prefix))
  if (!member) {
    return undefined
  }
  const fields = member.slice(prefix.length).split(';')
  if (fields.length !== 6 || fields[0] !== VERSION) {
    return undefined
  }
  const [, spanId, startMicros, name, method, target] = fields
  if (spanId !== parentId || !/^\d{1,17}$/.test(startMicros)) {
    return undefined
  }
  let startTime = Number(startMicros) / 1000
  if (startTime > now + MAX_AHEAD_MS || startTime < now - MAX_AGE_MS) {
    return undefined
  }
  if (startTime > now) {
    startTime = now
  }

  let attributes: DeferredRequestSpan['attributes']
  let decodedName: string
  try {
    decodedName = decodeURIComponent(name)
    attributes = { 'http.method': decodeURIComponent(method) }
    if (target) {
      attributes['http.target'] = decodeURIComponent(target)
    }
  } catch {
    return undefined
  }
  if (!decodedName || !attributes['http.method']) {
    return undefined
  }
  return { traceId, spanId, startTime, name: decodedName, attributes }
}

interface IdGenerator {
  generateTraceId(): string
  generateSpanId(): string
}

interface Sampler {
  shouldSample(
    context: unknown,
    traceId: string,
    name: string,
    kind: number,
    attributes: Record<string, unknown>,
    links: unknown[]
  ): { decision: number; traceState?: unknown }
}

interface SpanLike {
  isRecording(): boolean
  spanContext(): { traceId: string; spanId: string }
  end?(): void
}

// `SamplingDecision.RECORD_AND_SAMPLED` of the OpenTelemetry SDK.
const RECORD_AND_SAMPLED = 2

/**
 * The OpenTelemetry SDK's tracer behind an API tracer (a `ProxyTracer`, or
 * the SDK's tracer itself), with the internals used here: `_idGenerator` and
 * `_sampler` of `Tracer` in `@opentelemetry/sdk-trace` 2.x (`sdk-trace-base`
 * 1.x).
 */
function getSdkTracer(tracer: unknown):
  | {
      _idGenerator?: IdGenerator
      _sampler?: Sampler
    }
  | undefined {
  const proxy = tracer as { _getTracer?: () => unknown } | undefined
  const sdkTracer =
    typeof proxy?._getTracer === 'function' ? proxy._getTracer() : tracer
  return sdkTracer && typeof sdkTracer === 'object'
    ? (sdkTracer as { _idGenerator?: IdGenerator; _sampler?: Sampler })
    : undefined
}

function hasIdGenerator(
  generator: IdGenerator | undefined
): generator is IdGenerator {
  return (
    typeof generator?.generateSpanId === 'function' &&
    typeof generator.generateTraceId === 'function'
  )
}

/**
 * Reserves the IDs of a root span without starting it, as the OpenTelemetry
 * SDK's tracer would for `startSpan` (see `getSdkTracer`): a span ID and a
 * trace ID from its ID generator, and its sampler's decision (called once,
 * with `context`). A started span that is never ended would be kept by span
 * processors (e.g. `@vercel/otel` keeps open root spans by trace), so a
 * request span that another process emits (see `startSpanWithIds`) is
 * reserved instead.
 *
 * Returns `undefined` when the SDK internals aren't available or fail. A span
 * that wouldn't be sampled is reserved too (`sampled: false`), so the sampler's
 * decision isn't made again for other IDs.
 */
export function reserveRootSpanIds(
  tracer: unknown,
  {
    context,
    name,
    kind,
    attributes,
  }: {
    context: unknown
    name: string
    kind: number
    attributes: Record<string, unknown>
  }
):
  | { traceId: string; spanId: string; sampled: boolean; traceState: unknown }
  | undefined {
  try {
    const sdkTracer = getSdkTracer(tracer)
    const generator = sdkTracer?._idGenerator
    const sampler = sdkTracer?._sampler
    if (
      !hasIdGenerator(generator) ||
      typeof sampler?.shouldSample !== 'function'
    ) {
      return undefined
    }
    const spanId = generator.generateSpanId()
    const traceId = generator.generateTraceId()
    const result = sampler.shouldSample(
      context,
      traceId,
      name,
      kind,
      attributes,
      []
    )
    return {
      traceId,
      spanId,
      sampled: result?.decision === RECORD_AND_SAMPLED,
      traceState: result?.traceState,
    }
  } catch {
    return undefined
  }
}

/**
 * Starts a span with the given trace ID and span ID, which the OpenTelemetry
 * API can't do. It relies on an internal of the OpenTelemetry SDK's tracer
 * (see `getSdkTracer`): `startSpan` asks the tracer's `_idGenerator` for the
 * span ID and (for a root span) the trace ID before running the sampler and
 * span processors. During `start` (which must start the span synchronously),
 * the generator returns the given IDs for the first call of each kind and
 * delegates every other call to the original generator, which is always
 * restored.
 *
 * `tracer` is the API tracer (a `ProxyTracer` or the SDK's tracer). Returns
 * `undefined`, without calling `start`, when there is no SDK tracer with an ID
 * generator, and when the started span isn't recording or didn't get the IDs
 * (it is ended then, so span processors don't keep it).
 */
export function startSpanWithIds<S extends SpanLike>(
  tracer: unknown,
  traceId: string,
  spanId: string,
  start: (tracer: any) => S
): S | undefined {
  const sdkTracer = getSdkTracer(tracer)
  const original = sdkTracer?._idGenerator
  if (!sdkTracer || !hasIdGenerator(original)) {
    return undefined
  }

  let traceIdUsed = false
  let spanIdUsed = false
  sdkTracer._idGenerator = {
    generateTraceId() {
      if (traceIdUsed) {
        return original.generateTraceId()
      }
      traceIdUsed = true
      return traceId
    },
    generateSpanId() {
      if (spanIdUsed) {
        return original.generateSpanId()
      }
      spanIdUsed = true
      return spanId
    },
  }
  let span: S
  try {
    span = start(sdkTracer)
  } finally {
    sdkTracer._idGenerator = original
  }
  if (!span.isRecording()) {
    return undefined
  }
  const ids = span.spanContext()
  if (ids.traceId !== traceId || ids.spanId !== spanId) {
    span.end?.()
    return undefined
  }
  return span
}
