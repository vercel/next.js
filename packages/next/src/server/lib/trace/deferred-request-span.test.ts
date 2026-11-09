import {
  addTraceStateEntry,
  DEFERRED_REQUEST_SPAN_KEY,
  encodeDeferredRequestSpan,
  parseDeferredRequestSpan,
  removeTraceStateEntry,
  reserveRootSpanIds,
  startSpanWithIds,
} from './deferred-request-span'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`
// In milliseconds since the epoch.
const NOW = 1_800_000_000_000

const ENTRY = {
  spanId: SPAN_ID,
  startTime: NOW - 1_000,
  name: 'GET',
  attributes: { 'http.method': 'GET', 'http.target': '/page' },
}

function tracestateFor(entry = ENTRY, other?: string) {
  return addTraceStateEntry(
    other,
    DEFERRED_REQUEST_SPAN_KEY,
    encodeDeferredRequestSpan(entry)!
  )
}

describe('encodeDeferredRequestSpan', () => {
  it('encodes the span as a valid tracestate value', () => {
    const value = encodeDeferredRequestSpan(ENTRY)!
    expect(value).toMatchInlineSnapshot(
      `"1;00f067aa0ba902b7;1799999999000000;GET;GET;%2Fpage"`
    )
    expect(value).toMatch(
      /^[\x20-\x2b\x2d-\x3c\x3e-\x7e]*[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/
    )
  })

  it('percent-encodes characters that are not allowed', () => {
    const value = encodeDeferredRequestSpan({
      ...ENTRY,
      attributes: { 'http.method': 'GET', 'http.target': '/a,b=c;d e' },
    })!
    expect(value).not.toMatch(/[,= ]/)
    expect(
      parseDeferredRequestSpan(
        tracestateFor({
          ...ENTRY,
          attributes: { 'http.method': 'GET', 'http.target': '/a,b=c;d e' },
        }),
        TRACEPARENT,
        NOW
      )?.attributes['http.target']
    ).toBe('/a,b=c;d e')
  })

  it('drops http.target to stay within 256 characters', () => {
    const value = encodeDeferredRequestSpan({
      ...ENTRY,
      attributes: {
        'http.method': 'GET',
        'http.target': '/' + 'a'.repeat(300),
      },
    })!
    expect(value.length).toBeLessThanOrEqual(256)
    expect(value).toBe('1;00f067aa0ba902b7;1799999999000000;GET;GET;')
  })

  it('gives up when the value is still too long', () => {
    expect(
      encodeDeferredRequestSpan({ ...ENTRY, name: 'x'.repeat(300) })
    ).toBeUndefined()
  })

  it('drops an http.target that cannot be encoded, without throwing', () => {
    expect(
      encodeDeferredRequestSpan({
        ...ENTRY,
        attributes: { 'http.method': 'GET', 'http.target': '/\ud800' },
      })
    ).toBe('1;00f067aa0ba902b7;1799999999000000;GET;GET;')
    expect(
      encodeDeferredRequestSpan({ ...ENTRY, name: '\ud800' })
    ).toBeUndefined()
  })
})

describe('addTraceStateEntry / removeTraceStateEntry', () => {
  it('adds the entry leftmost and replaces an existing one', () => {
    expect(
      addTraceStateEntry('a=1,next-deferred=old, b=2', 'next-deferred', 'new')
    ).toBe('next-deferred=new,a=1,b=2')
  })

  it('drops invalid members', () => {
    expect(addTraceStateEntry('a=1,Not Valid,=x,b=2', 'k', 'v')).toBe(
      'k=v,a=1,b=2'
    )
  })

  it('drops simple keys not starting with a letter and duplicate keys', () => {
    expect(removeTraceStateEntry('1a=x,a=1,a=2,t@vendor=3,0t@v=4', 'k')).toBe(
      'a=1,t@vendor=3,0t@v=4'
    )
  })

  it('keeps at most 32 entries, evicting from the right', () => {
    const others = Array.from({ length: 40 }, (_, i) => `k${i}=v`).join(',')
    const result = addTraceStateEntry(others, 'next-deferred', 'x').split(',')
    expect(result).toHaveLength(32)
    expect(result[0]).toBe('next-deferred=x')
    expect(result[31]).toBe('k30=v')
  })

  it('keeps at most 512 characters, keeping the new entry', () => {
    const others = Array.from(
      { length: 20 },
      (_, i) => `k${i}=${'v'.repeat(40)}`
    ).join(',')
    const result = addTraceStateEntry(others, 'next-deferred', 'x'.repeat(200))
    expect(result.length).toBeLessThanOrEqual(512)
    expect(result.startsWith(`next-deferred=${'x'.repeat(200)},k0=`)).toBe(true)
  })

  it('removes an entry and keeps the others', () => {
    expect(
      removeTraceStateEntry('next-deferred=x,a=1, b=2', 'next-deferred')
    ).toBe('a=1,b=2')
    expect(
      removeTraceStateEntry('next-deferred=x', 'next-deferred')
    ).toBeUndefined()
    expect(removeTraceStateEntry(undefined, 'next-deferred')).toBeUndefined()
  })
})

describe('parseDeferredRequestSpan', () => {
  it('parses a valid entry bound to the traceparent', () => {
    expect(
      parseDeferredRequestSpan(tracestateFor(ENTRY, 'a=1'), TRACEPARENT, NOW)
    ).toEqual({
      traceId: TRACE_ID,
      ...ENTRY,
    })
  })

  it.each([
    ['no tracestate', undefined, TRACEPARENT],
    ['no entry', 'a=1', TRACEPARENT],
    ['no traceparent', tracestateFor(), undefined],
    ['a malformed value', 'next-deferred=1;nope', TRACEPARENT],
    [
      'another version',
      tracestateFor().replace('next-deferred=1;', 'next-deferred=2;'),
      TRACEPARENT,
    ],
    [
      'another span ID',
      tracestateFor({ ...ENTRY, spanId: 'aaaaaaaaaaaaaaaa' }),
      TRACEPARENT,
    ],
    [
      'an unsampled traceparent',
      tracestateFor(),
      `00-${TRACE_ID}-${SPAN_ID}-00`,
    ],
    [
      'an invalid traceparent',
      tracestateFor(),
      `00-${'0'.repeat(32)}-${SPAN_ID}-01`,
    ],
    [
      'a start more than 1 minute ahead',
      tracestateFor({ ...ENTRY, startTime: NOW + 60_001 }),
      TRACEPARENT,
    ],
    [
      'a start more than 30 minutes old',
      tracestateFor({ ...ENTRY, startTime: NOW - 30 * 60_000 - 1 }),
      TRACEPARENT,
    ],
  ])('ignores %s', (_, tracestate, traceparent) => {
    expect(
      parseDeferredRequestSpan(tracestate, traceparent, NOW)
    ).toBeUndefined()
  })

  it('ignores an oversized tracestate', () => {
    const padding = Array.from(
      { length: 20 },
      (_, i) => `k${i}=${'v'.repeat(250)}`
    ).join(',')
    expect(
      parseDeferredRequestSpan(
        `${tracestateFor()},${padding}`,
        TRACEPARENT,
        NOW
      )
    ).toBeUndefined()
  })

  it('accepts other sampled trace flags', () => {
    expect(
      parseDeferredRequestSpan(
        tracestateFor(),
        `00-${TRACE_ID}-${SPAN_ID}-03`,
        NOW
      )
    ).toBeDefined()
  })

  it('sets a start time that is ahead (up to 1 minute) to now', () => {
    expect(
      parseDeferredRequestSpan(
        tracestateFor({ ...ENTRY, startTime: NOW + 30_000 }),
        TRACEPARENT,
        NOW
      )?.startTime
    ).toBe(NOW)
  })

  it('accepts a start time 30 minutes old', () => {
    expect(
      parseDeferredRequestSpan(
        tracestateFor({ ...ENTRY, startTime: NOW - 30 * 60_000 }),
        TRACEPARENT,
        NOW
      )?.startTime
    ).toBe(NOW - 30 * 60_000)
  })
})

// Mirrors the order of `Tracer.startSpan` in `@opentelemetry/sdk-trace` 2.x:
// the IDs are generated before the sampler and span processors run (which may
// start spans themselves).
function createSdkTracer(
  hooks: { onSample?: (tracer: any) => void; recording?: boolean } = {}
) {
  let counter = 0
  const tracer: any = {
    _idGenerator: {
      generateTraceId: () => `trace${++counter}`.padStart(32, '0'),
      generateSpanId: () => `span${++counter}`.padStart(16, '0'),
    },
    startSpan(name: string) {
      const spanId = tracer._idGenerator.generateSpanId()
      const traceId = tracer._idGenerator.generateTraceId()
      hooks.onSample?.(tracer)
      return {
        name,
        isRecording: () => hooks.recording ?? true,
        spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
      }
    },
  }
  return tracer
}

describe('startSpanWithIds', () => {
  it('starts the span with the given IDs and restores the generator', () => {
    const tracer = createSdkTracer()
    const generator = tracer._idGenerator
    const span = startSpanWithIds(tracer, TRACE_ID, SPAN_ID, (t) =>
      t.startSpan('GET')
    )
    expect(span?.spanContext()).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    })
    expect(tracer._idGenerator).toBe(generator)
    expect(tracer.startSpan('other').spanContext().spanId).not.toBe(SPAN_ID)
  })

  it('works through a ProxyTracer', () => {
    const sdkTracer = createSdkTracer()
    const proxy = { _getTracer: () => sdkTracer }
    const span = startSpanWithIds(proxy, TRACE_ID, SPAN_ID, (t) =>
      t.startSpan('GET')
    )
    expect(span?.spanContext().spanId).toBe(SPAN_ID)
  })

  it('gives spans started during the call (e.g. by a sampler) new IDs', () => {
    let nested: any
    let sampling = false
    const tracer = createSdkTracer({
      onSample: (t) => {
        if (!sampling) {
          sampling = true
          nested = t.startSpan('nested')
        }
      },
    })
    const span = startSpanWithIds(tracer, TRACE_ID, SPAN_ID, (t) =>
      t.startSpan('GET')
    )
    expect(span?.spanContext()).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    })
    expect(nested.spanContext().spanId).not.toBe(SPAN_ID)
    expect(nested.spanContext().traceId).not.toBe(TRACE_ID)
  })

  it('restores the generator when starting the span throws', () => {
    const tracer = createSdkTracer()
    const generator = tracer._idGenerator
    expect(() =>
      startSpanWithIds(tracer, TRACE_ID, SPAN_ID, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(tracer._idGenerator).toBe(generator)
  })

  it('returns undefined without an SDK tracer with an ID generator', () => {
    const start = jest.fn()
    expect(
      startSpanWithIds({ startSpan: start }, TRACE_ID, SPAN_ID, start)
    ).toBeUndefined()
    expect(
      startSpanWithIds({ _getTracer: () => ({}) }, TRACE_ID, SPAN_ID, start)
    ).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })

  it('returns undefined for a span that is not recording', () => {
    const tracer = createSdkTracer({ recording: false })
    expect(
      startSpanWithIds(tracer, TRACE_ID, SPAN_ID, (t) => t.startSpan('GET'))
    ).toBeUndefined()
  })

  it('ends a recording span that did not get the IDs', () => {
    const end = jest.fn()
    const tracer = {
      _idGenerator: {
        generateTraceId: () => 'other'.padStart(32, '0'),
        generateSpanId: () => 'other'.padStart(16, '0'),
      },
    }
    expect(
      startSpanWithIds(tracer, TRACE_ID, SPAN_ID, () => ({
        isRecording: () => true,
        spanContext: () => ({ traceId: 'x', spanId: 'y' }),
        end,
      }))
    ).toBeUndefined()
    expect(end).toHaveBeenCalledTimes(1)
  })
})

describe('reserveRootSpanIds', () => {
  const CONTEXT = { marker: 'root context' }
  const OPTIONS = {
    context: CONTEXT,
    name: 'GET',
    kind: 1,
    attributes: { 'http.method': 'GET' },
  }

  function createSampledTracer(decision = 2) {
    const startSpan = jest.fn()
    const shouldSample = jest.fn(() => ({
      decision,
      traceState: 'sampler trace state',
    }))
    const tracer = {
      _idGenerator: {
        generateTraceId: () => TRACE_ID,
        generateSpanId: () => SPAN_ID,
      },
      _sampler: { shouldSample },
      startSpan,
    }
    return { tracer, startSpan, shouldSample }
  }

  it('reserves IDs and samples once, without starting a span', () => {
    const { tracer, startSpan, shouldSample } = createSampledTracer()
    expect(reserveRootSpanIds(tracer, OPTIONS)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      sampled: true,
      traceState: 'sampler trace state',
    })
    expect(shouldSample).toHaveBeenCalledTimes(1)
    expect(shouldSample).toHaveBeenCalledWith(
      CONTEXT,
      TRACE_ID,
      'GET',
      1,
      { 'http.method': 'GET' },
      []
    )
    expect(startSpan).not.toHaveBeenCalled()
  })

  it('works through a ProxyTracer', () => {
    const { tracer } = createSampledTracer()
    expect(
      reserveRootSpanIds({ _getTracer: () => tracer }, OPTIONS)?.spanId
    ).toBe(SPAN_ID)
  })

  it.each([
    ['not recorded', 0],
    ['recorded but not sampled', 1],
  ])('reserves an unsampled span that would be %s', (_, decision) => {
    const { tracer, shouldSample } = createSampledTracer(decision)
    expect(reserveRootSpanIds(tracer, OPTIONS)).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      sampled: false,
      traceState: 'sampler trace state',
    })
    expect(shouldSample).toHaveBeenCalledTimes(1)
  })

  it('returns undefined without SDK internals or when sampling throws', () => {
    const { tracer } = createSampledTracer()
    expect(
      reserveRootSpanIds({ ...tracer, _sampler: undefined }, OPTIONS)
    ).toBeUndefined()
    expect(
      reserveRootSpanIds({ ...tracer, _idGenerator: undefined }, OPTIONS)
    ).toBeUndefined()
    expect(
      reserveRootSpanIds(
        {
          ...tracer,
          _sampler: {
            shouldSample: () => {
              throw new Error('boom')
            },
          },
        },
        OPTIONS
      )
    ).toBeUndefined()
    expect(reserveRootSpanIds(undefined, OPTIONS)).toBeUndefined()
  })
})
