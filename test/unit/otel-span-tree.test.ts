import { printSpanTree, type TreeSpan } from 'otel-span-tree'
import {
  collectSpanEventGroups,
  collectSpanEvents,
  mergeSpanEvents,
  parseSpanEvents,
  SPAN_EVENT_MARKER,
  type SpanEvent,
} from 'otel-span-capture'

const TRACE = '0123456789abcdef0123456789abcdef'

// `times` in milliseconds.
function span(
  id: string,
  parentId: string | undefined,
  times?: [number, number | undefined]
): TreeSpan {
  return {
    id,
    parentId,
    traceId: TRACE,
    name: id,
    ...(times
      ? {
          startTime: times[0] * 1000,
          endTime: times[1] === undefined ? undefined : times[1] * 1000,
          ended: times[1] !== undefined,
        }
      : {}),
  }
}

describe('printSpanTree envelope badges', () => {
  it('has no badges when parents cover their descendants', () => {
    expect(
      printSpanTree([
        span('root', undefined, [0, 100]),
        span('child', 'root', [0, 50]),
        span('grandchild', 'child', [10, 50]),
        span('sibling', 'root', [50, 100]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root
      ├─ child
      │  └─ grandchild
      └─ sibling"
    `)
  })

  it('badges a parent that ends before a child', () => {
    expect(
      printSpanTree([
        span('root', undefined, [0, 100]),
        span('child', 'root', [10, 101]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root [error: doesn't cover descendants]
      └─ child"
    `)
  })

  it('badges every ancestor of a grandchild that starts too early', () => {
    expect(
      printSpanTree([
        span('root', undefined, [10, 100]),
        span('child', 'root', [20, 90]),
        span('grandchild', 'child', [5, 30]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root [error: doesn't cover descendants]
      └─ child [error: doesn't cover descendants]
         └─ grandchild"
    `)
  })

  it('checks descendants below omitted spans', () => {
    expect(
      printSpanTree(
        [
          span('root', undefined, [0, 100]),
          span('omitted', 'root', [10, 20]),
          span('below-omitted', 'omitted', [10, 120]),
        ],
        { omit: (s) => s.id === 'omitted' }
      )
    ).toMatchInlineSnapshot(
      `"[trace A] root [error: doesn't cover descendants]"`
    )
  })

  it('badges an ended parent of a child that has not ended', () => {
    expect(
      printSpanTree([
        span('root', undefined, [0, 100]),
        span('child', 'root', [10, undefined]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root [error: doesn't cover descendants]
      └─ child [error: not ended]"
    `)
  })

  it('counts times within the same millisecond as covered', () => {
    expect(
      printSpanTree([
        span('root', undefined, [10, 100]),
        span('starts-0.9ms-early', 'root', [9.1, 50]),
        span('ends-0.9ms-late', 'root', [50, 100.9]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root
      ├─ ends-0.9ms-late
      └─ starts-0.9ms-early"
    `)
    expect(
      printSpanTree([
        span('root', undefined, [10, 100]),
        span('ends-1ms-late', 'root', [50, 101]),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root [error: doesn't cover descendants]
      └─ ends-1ms-late"
    `)
  })

  it('does not check spans without times', () => {
    expect(
      printSpanTree([
        span('root', undefined),
        span('child', 'root', [10, 20]),
        span('timed-parent', undefined, [0, 5]),
        span('untimed-child', 'timed-parent'),
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] root
      └─ child
      [trace A] timed-parent
      └─ untimed-child"
    `)
  })

  it('does not check start response spans, but prints them', () => {
    expect(
      printSpanTree([
        span('render', undefined, [0, 10]),
        {
          ...span('start response', 'render', [5, 20]),
          type: 'NextNodeServer.startResponse',
        },
        span('other render', undefined, [0, 10]),
        { ...span('other', 'other render', [5, 20]), type: 'Other.type' },
      ])
    ).toMatchInlineSnapshot(`
      "[trace A] other render [error: doesn't cover descendants]
      └─ other (Other.type)
      [trace A] render
      └─ start response (NextNodeServer.startResponse)"
    `)
  })
})

function event(
  kind: 'start' | 'end',
  id: string,
  parentId: string | undefined,
  start: number,
  end?: number,
  traceId = TRACE,
  eventId = `${kind}:${id}`
): SpanEvent {
  return {
    eventId,
    event: kind,
    traceId,
    id,
    parentId,
    name: id,
    type: `type-${id}`,
    startTime: start,
    ...(kind === 'end' ? { endTime: end } : {}),
  }
}

const line = (e: SpanEvent) => `${SPAN_EVENT_MARKER} ${JSON.stringify(e)}`

describe('span event capture', () => {
  it('parses marker lines anywhere in the output and ignores the rest', () => {
    const { events, malformed } = parseSpanEvents(
      [
        'ready on http://localhost:3000',
        `prefix ${line(event('start', 'a', undefined, 1))}`,
        `${SPAN_EVENT_MARKER} {"event":"end","traceId":`, // still being written
        `${SPAN_EVENT_MARKER} {"not":"an event"}`,
        // Without an event ID, redeliveries couldn't be told apart.
        `${SPAN_EVENT_MARKER} ${JSON.stringify({ ...event('start', 'b', undefined, 1), eventId: undefined })}`,
        line(event('end', 'a', undefined, 1, 2)),
      ].join('\n')
    )
    expect(events.map((e) => `${e.event}:${e.id}`)).toEqual([
      'start:a',
      'end:a',
    ])
    expect(malformed).toBe(3)
  })

  it('merges reordered events and redeliveries of the same event', () => {
    const { spans, duplicateEnds } = mergeSpanEvents(
      [
        event('end', 'child', 'root', 10, 20),
        event('start', 'root', undefined, 0),
        // Started again in another process, with another event ID.
        event('start', 'root', undefined, 0, undefined, TRACE, 'other-start'),
        event('end', 'root', undefined, 0, 30),
        event('start', 'child', 'root', 10),
        // Delivered again (e.g. by another log page).
        event('end', 'child', 'root', 10, 20),
        event('start', 'other', undefined, 0, undefined, 'f'.repeat(32)),
      ],
      [TRACE]
    )
    expect(duplicateEnds).toEqual([])
    expect(spans).toEqual([
      expect.objectContaining({ id: 'child', ended: true, endTime: 20 }),
      expect.objectContaining({ id: 'root', ended: true, endTime: 30 }),
    ])
  })

  it('reports spans ended by distinct end events', () => {
    const { duplicateEnds } = mergeSpanEvents(
      [
        event('end', 'root', undefined, 0, 30),
        event('end', 'root', undefined, 0, 31, TRACE, 'second-end'),
      ],
      [TRACE]
    )
    expect(duplicateEnds).toEqual(['root'])
  })

  it('reports spans with only start events as not ended', () => {
    expect(
      mergeSpanEvents([event('start', 'a', undefined, 5)], [TRACE]).spans
    ).toEqual([
      expect.objectContaining({ id: 'a', ended: false, startTime: 5 }),
    ])
  })

  const options = {
    traceIds: [TRACE],
    expected: ['type-mw', 'type-render'],
    timeoutMs: 2_000,
    settleMs: 10,
    pollIntervalMs: 10,
  }

  it('waits for spans of a function that arrive later, then settles', async () => {
    const polls = [
      [event('start', 'mw', 'root', 1), event('end', 'mw', 'root', 1, 2)],
      [
        event('start', 'mw', 'root', 1),
        event('end', 'mw', 'root', 1, 2),
        // The render's spans arrive later, in reverse order.
        event('end', 'render', 'root', 3, 4),
        event('start', 'render', 'root', 3),
      ],
    ]
    let reads = 0
    const spans = await collectSpanEvents(async () => {
      const events = polls[Math.min(reads++, polls.length - 1)]
      return events.map(line).join('\n')
    }, options)
    expect(spans.map((s) => s.id).sort()).toEqual(['mw', 'render'])
    // Incomplete, complete, and the settling poll.
    expect(reads).toBe(3)
  })

  it('does not settle while new events keep arriving', async () => {
    const all = [
      event('start', 'mw', 'root', 1),
      event('end', 'mw', 'root', 1, 2),
      event('start', 'render', 'root', 3),
      event('end', 'render', 'root', 3, 4),
      event('start', 'late', 'render', 3),
      event('end', 'late', 'render', 3, 4),
    ]
    let reads = 0
    const spans = await collectSpanEvents(async () => {
      reads++
      return all
        .slice(0, reads === 1 ? 4 : 6)
        .map(line)
        .join('\n')
    }, options)
    expect(spans.map((s) => s.id).sort()).toEqual(['late', 'mw', 'render'])
  })

  it('keeps the events of earlier polls (e.g. log pages that expired)', async () => {
    const polls = [
      [event('start', 'mw', 'root', 1), event('end', 'mw', 'root', 1, 2)],
      [
        event('start', 'render', 'root', 3),
        event('end', 'render', 'root', 3, 4),
      ],
    ]
    let reads = 0
    const spans = await collectSpanEvents(async () => {
      const events = polls[Math.min(reads++, polls.length - 1)]
      return events.map(line).join('\n')
    }, options)
    expect(spans.map((s) => s.id).sort()).toEqual(['mw', 'render'])
  })

  it('fails with a diagnostic when a span is ended twice', async () => {
    await expect(
      collectSpanEvents(
        async () =>
          [
            event('start', 'mw', 'root', 1),
            event('end', 'mw', 'root', 1, 2),
            event('end', 'render', 'root', 3, 4),
            event('end', 'render', 'root', 3, 5, TRACE, 'second-end'),
          ]
            .map(line)
            .join('\n'),
        options
      )
    ).rejects.toThrow(/Spans ended more than once: \[render\][\s\S]*poll 1:/)
  })

  it('passes the deadline to the reader and retries failed reads', async () => {
    const deadlines: number[] = []
    let reads = 0
    const spans = await collectSpanEvents(async (deadline) => {
      deadlines.push(deadline)
      if (reads++ === 0) {
        throw new Error('vercel logs failed (timed out)')
      }
      return [
        event('start', 'mw', 'root', 1),
        event('end', 'mw', 'root', 1, 2),
        event('end', 'render', 'root', 3, 4),
      ]
        .map(line)
        .join('\n')
    }, options)
    expect(spans.map((s) => s.id).sort()).toEqual(['mw', 'render'])
    expect(deadlines[0]).toBeGreaterThan(Date.now())
    expect(new Set(deadlines).size).toBe(1)
  })

  it('fails with the read errors when reading keeps failing', async () => {
    await expect(
      collectSpanEvents(
        async () => {
          throw new Error('vercel logs failed (exit code 1): 504')
        },
        { ...options, timeoutMs: 100 }
      )
    ).rejects.toThrow(
      /weren't completely captured[\s\S]*poll 1: reading failed: Error: vercel logs failed \(exit code 1\): 504/
    )
  })

  it('fails a complete capture that no later poll confirms', async () => {
    let reads = 0
    const complete = [
      event('start', 'mw', 'root', 1),
      event('end', 'mw', 'root', 1, 2),
      event('end', 'render', 'root', 3, 4),
    ]
    await expect(
      collectSpanEvents(
        async () => {
          if (reads++ > 0) {
            throw new Error('vercel logs failed (timed out)')
          }
          return complete.map(line).join('\n')
        },
        { ...options, timeoutMs: 100 }
      )
    ).rejects.toThrow(
      /were captured, but no later poll confirmed[\s\S]*poll 2: reading failed/
    )
  })

  it('fails a capture completed too close to the deadline to confirm', async () => {
    await expect(
      collectSpanEvents(
        async () =>
          [
            event('start', 'mw', 'root', 1),
            event('end', 'mw', 'root', 1, 2),
            event('end', 'render', 'root', 3, 4),
          ]
            .map(line)
            .join('\n'),
        { ...options, timeoutMs: 50, settleMs: 1_000 }
      )
    ).rejects.toThrow(/were captured, but no later poll confirmed/)
  })

  it('fails with a diagnostic when a span never ends', async () => {
    await expect(
      collectSpanEvents(
        async () =>
          [
            event('start', 'mw', 'root', 1),
            event('end', 'mw', 'root', 1, 2),
            event('start', 'render', 'root', 3),
          ]
            .map(line)
            .join('\n'),
        { ...options, timeoutMs: 100 }
      )
    ).rejects.toThrow(
      /weren't completely captured[\s\S]*Missing expected spans: \[type-render\][\s\S]*haven't ended: \[render \(type-render\)\][\s\S]*\[error: not ended\][\s\S]*poll 1:/
    )
  })
})

describe('span event capture of several requests at once', () => {
  const OTHER = 'f'.repeat(32)
  const groups = [
    { traceIds: [TRACE], expected: ['type-mw', 'type-render'] },
    { traceIds: [OTHER], expected: ['type-other-mw'] },
  ]
  const options = { timeoutMs: 2_000, settleMs: 10, pollIntervalMs: 10 }

  it('collects every request in one poll loop, with one read per poll', async () => {
    const polls = [
      [event('start', 'mw', 'root', 1), event('end', 'mw', 'root', 1, 2)],
      [
        event('start', 'mw', 'root', 1),
        event('end', 'mw', 'root', 1, 2),
        // The second request's spans and the first's render arrive later.
        event('end', 'render', 'root', 3, 4),
        event('end', 'other-mw', undefined, 5, 6, OTHER),
      ],
    ]
    let reads = 0
    const results = await collectSpanEventGroups(
      async () =>
        polls[Math.min(reads++, polls.length - 1)].map(line).join('\n'),
      { ...options, groups }
    )
    expect(
      results.map((result) =>
        'spans' in result ? result.spans.map((s) => s.id).sort() : result
      )
    ).toEqual([['mw', 'render'], ['other-mw']])
    // Incomplete, complete, and the settling poll.
    expect(reads).toBe(3)
  })

  it('fails only the requests whose capture is incomplete', async () => {
    const results = await collectSpanEventGroups(
      async () =>
        [event('start', 'mw', 'root', 1), event('end', 'mw', 'root', 1, 2)]
          .concat(event('end', 'other-mw', undefined, 5, 6, OTHER))
          .map(line)
          .join('\n'),
      { ...options, timeoutMs: 100, groups }
    )
    expect('error' in results[0] && String(results[0].error)).toMatch(
      new RegExp(
        `trace\\(s\\) ${TRACE} weren't completely captured[\\s\\S]*Missing expected spans: \\[type-render\\]`
      )
    )
    expect('spans' in results[1] && results[1].spans.map((s) => s.id)).toEqual([
      'other-mw',
    ])
  })

  it('fails only the request with a span ended twice', async () => {
    const results = await collectSpanEventGroups(
      async () =>
        [
          event('start', 'mw', 'root', 1),
          event('end', 'mw', 'root', 1, 2),
          event('end', 'render', 'root', 3, 4),
          event('end', 'render', 'root', 3, 5, TRACE, 'second-end'),
          event('end', 'other-mw', undefined, 5, 6, OTHER),
        ]
          .map(line)
          .join('\n'),
      { ...options, groups }
    )
    expect('error' in results[0] && String(results[0].error)).toMatch(
      /Spans ended more than once: \[render\]/
    )
    expect('spans' in results[1] && results[1].spans.map((s) => s.id)).toEqual([
      'other-mw',
    ])
  })

  it('still checks a settled request while others are collected', async () => {
    const first = [
      event('start', 'mw', 'root', 1),
      event('end', 'mw', 'root', 1, 2),
      event('end', 'render', 'root', 3, 4),
    ]
    // The first request settles (polls 1-2) while the second isn't complete.
    // Then a second `end` event and a span that never ends arrive for it.
    const late = [
      event('end', 'render', 'root', 3, 5, TRACE, 'second-end'),
      event('end', 'other-mw', undefined, 5, 6, OTHER),
    ]
    const lateStart = [
      event('start', 'late', 'render', 3),
      event('end', 'other-mw', undefined, 5, 6, OTHER),
    ]
    for (const [arrives, error] of [
      [late, /Spans ended more than once: \[render\]/],
      [lateStart, /weren't completely captured[\s\S]*haven't ended: \[late/],
    ] as const) {
      let reads = 0
      const results = await collectSpanEventGroups(
        async () =>
          (reads++ < 3 ? first : [...first, ...arrives]).map(line).join('\n'),
        { ...options, timeoutMs: 200, groups }
      )
      expect('error' in results[0] && String(results[0].error)).toMatch(error)
      expect('spans' in results[1]).toBe(true)
    }
  })

  it('logs every captured span event once', async () => {
    const mw = [
      event('start', 'mw', 'root', 1),
      event('end', 'mw', 'root', 1, 2),
    ]
    const rest = [
      event('end', 'render', 'root', 3, 4),
      event('end', 'other-mw', undefined, 5, 6, OTHER),
      // Not one of the collected traces.
      event('end', 'unrelated', undefined, 5, 6, 'e'.repeat(32)),
    ]
    let reads = 0
    const logged: string[] = []
    await collectSpanEventGroups(
      async () => (reads++ === 0 ? mw : [...mw, ...rest]).map(line).join('\n'),
      { ...options, groups, log: (message) => logged.push(message) }
    )
    const events = logged.filter((message) =>
      message.includes(SPAN_EVENT_MARKER)
    )
    expect(events).toEqual(
      [...mw, ...rest.slice(0, 2)].map((e) => expect.stringContaining(line(e)))
    )
  })
})
