import {
  createReactTimingCollector,
  type ReactTimingRecord,
} from './react-debug-timing'
import { createLocalRenderTiming } from './react-render-timing'
import { registerLocalSpanRecorder } from './local-span-recorder'
import { getTracer } from './tracer'
import { AppRenderSpan } from './constants'
import { runWithLocalSpanSink, type SpanStoreRecord } from './span-store'

// React's emitTimingChunk and emitDebugChunk put D references in Flight and
// the referenced models in the debug channel when a debug destination exists.
const flight = '0:D"$1"\n0:D"$2"\n0:D"$3"\n'
const debug =
  ':N1000\n1:{"time":2}\n2:{"name":"Page","env":"Server","props":{"secret":"hidden"}}\n3:{"time":5}\n'

function setup() {
  const timings: ReactTimingRecord[] = []
  const collector = createReactTimingCollector((batch) =>
    timings.push(...batch)
  )
  return { collector, timings }
}

describe('React debug timings', () => {
  it('retains the component owner path when ancestors arrive later', async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:{"name":"LinkComponent","owner":"$4"}\n3:{"time":5}\n4:{"name":"Navigation","owner":"$5"}\n'
    )
    await Promise.resolve()
    expect(timings).toEqual([])
    collector.readDebugChunk('5:{"name":"RootLayout"}\n')
    collector.finish()
    expect(timings).toEqual([
      expect.objectContaining({
        componentPath: 'RootLayout › Navigation › LinkComponent',
      }),
    ])
  })

  it.each([
    ['', '… › LinkComponent'],
    [
      '4:{"name":"Navigation","owner":"$2"}\n',
      '… › Navigation › LinkComponent',
    ],
  ])(
    'keeps timings with a partial path for missing or cyclic owners',
    (owners, path) => {
      const { collector, timings } = setup()
      collector.readFlightChunk(flight)
      collector.readDebugChunk(
        ':N1000\n1:{"time":2}\n2:{"name":"LinkComponent","owner":"$4"}\n3:{"time":5}\n' +
          owners
      )
      collector.finish()
      expect(timings).toEqual([
        expect.objectContaining({ componentPath: path, durationMs: 3 }),
      ])
    }
  )

  it('retains the exact render callsite from an outlined component model', async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(':N1000\n1:{"time":2}\n2:"$4"\n3:{"time":5}\n')
    await Promise.resolve()
    expect(timings).toEqual([])
    collector.readDebugChunk(
      '4:{"name":"LinkComponent","env":"Server","stack":[["RootLayout","file:///app/layout.tsx",12,7],["Ancestor","file:///app/other.tsx",1,1]]}\n'
    )
    collector.finish()
    expect(timings).toEqual([
      expect.objectContaining({
        source: {
          methodName: 'RootLayout',
          file: 'file:///app/layout.tsx',
          line: 12,
          column: 7,
        },
      }),
    ])
  })

  it('bounds owner breadcrumbs without dropping a timed interval', () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:{"name":"LinkComponent","owner":"$4"}\n3:{"time":5}\n' +
        Array.from(
          { length: 30 },
          (_, i) =>
            `${(i + 4).toString(16)}:${JSON.stringify({
              name: 'Navigation'.repeat(20),
              owner: `$${(i + 5).toString(16)}`,
            })}\n`
        ).join('')
    )
    collector.finish()
    expect(timings).toHaveLength(1)
    expect(timings[0].componentPath).toMatch(/^… › /)
    expect(timings[0].componentPath).toMatch(/ › LinkComponent$/)
    expect(timings[0].componentPath!.length).toBeLessThanOrEqual(1024)
  })

  it('uses the await callsite, never the promise creation or owner stack', () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(
      flight + flight.replaceAll('0:D', 'f:D').replaceAll('$2', '$6')
    )
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:{"awaited":"$@4","env":"Server","owner":"$5","stack":[["Panel","file:///app/panel.tsx",20,3]]}\n3:{"time":5}\n4:J{"name":"fetch","stack":[["createPromise","file:///app/data.ts",10,1]]}\n5:{"name":"Panel","stack":[["Page","file:///app/page.tsx",5,1]]}\n6:{"awaited":"$@4","env":"Server","owner":"$5"}\n'
    )
    collector.finish()
    expect(timings[0]).toMatchObject({
      componentPath: 'Panel',
      source: {
        methodName: 'Panel',
        file: 'file:///app/panel.tsx',
        line: 20,
        column: 3,
      },
    })
    expect(timings[1]).not.toHaveProperty('source')
  })

  it.each(
    [
      [['Page', 'file:///app/page.tsx', -1, 1]],
      [['Page', 'file:///app/page.tsx', 1, 0]],
      [['Page', 'file:///' + 'x'.repeat(2048), 1, 1]],
      '$4',
    ].map((stack) => [stack])
  )(
    'omits invalid or unresolved source locations without dropping timings: %j',
    (stack) => {
      const { collector, timings } = setup()
      collector.readFlightChunk(flight)
      collector.readDebugChunk(
        ':N1000\n1:{"time":2}\n2:' +
          JSON.stringify({ name: 'Page', stack }) +
          '\n3:{"time":5}\n'
      )
      collector.finish()
      expect(timings).toHaveLength(1)
      expect(timings[0]).not.toHaveProperty('source')
    }
  )

  it.each(['$4:props', '$4:stack', '$5', '$5:0'])(
    'does not reinterpret non-frame references %s',
    (stack) => {
      const { collector, timings } = setup()
      collector.readFlightChunk(flight)
      collector.readDebugChunk(
        ':N1000\n1:{"time":2}\n2:' +
          JSON.stringify({ name: 'Link', stack }) +
          '\n3:{"time":5}\n4:{"name":"Other","stack":"$5"}\n5:["$6"]\n6:["Page","file:///app/page.tsx",8,4]\n'
      )
      collector.finish()
      expect(timings[0]).not.toHaveProperty('source')
    }
  )

  it('identifies each render pass independently of its shared parent span', () => {
    const previous = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    registerLocalSpanRecorder()
    const records: SpanStoreRecord[] = []
    try {
      runWithLocalSpanSink(
        (span) => records.push(span),
        () =>
          getTracer().trace(AppRenderSpan.renderToReadableStream, () => {
            for (let pass = 0; pass < 2; pass++) {
              const render = createLocalRenderTiming()!
              render.start()
              render.readFlightChunk(flight + flight.replaceAll('0:D', 'f:D'))
              render.readDebugChunk(debug)
              render.finishFlight()
              render.finishDebug()
            }
          })
      )
      const intervals = records.filter(
        (span) => span.name === 'ReactServerComponents.component'
      )
      expect(intervals).toHaveLength(4)
      const passIds = intervals.map(
        (span) => span.attributes?.['next.rsc.render_id']
      )
      expect(passIds[0]).toEqual(expect.any(String))
      expect(passIds[0]).toBe(passIds[1])
      expect(passIds[2]).toBe(passIds[3])
      expect(passIds[0]).not.toBe(passIds[2])
      expect(new Set(intervals.map((span) => span.parentSpanId)).size).toBe(1)
    } finally {
      if (previous === undefined) delete process.env.__NEXT_DEV_SERVER
      else process.env.__NEXT_DEV_SERVER = previous
    }
  })

  it('keeps the captured render parent and collector when streams finish later', () => {
    const previous = process.env.__NEXT_DEV_SERVER
    process.env.__NEXT_DEV_SERVER = '1'
    registerLocalSpanRecorder()
    const records: SpanStoreRecord[] = []
    const unrelated: SpanStoreRecord[] = []
    try {
      let render!: NonNullable<ReturnType<typeof createLocalRenderTiming>>
      let parent!: { traceId: string; spanId: string }
      runWithLocalSpanSink(
        (span) => records.push(span),
        () =>
          getTracer().trace(AppRenderSpan.renderToReadableStream, (span) => {
            expect(span).toBeDefined()
            parent = span!.spanContext()
            render = createLocalRenderTiming()!
            render.start()
          })
      )
      runWithLocalSpanSink(
        (span) => unrelated.push(span),
        () => {
          render.readFlightChunk(flight)
          render.readDebugChunk(debug)
          render.finishFlight()
          render.finishDebug()
        }
      )
      const intervals = records.filter(
        (span) => span.name === 'ReactServerComponents.component'
      )
      expect(intervals).toEqual([
        expect.objectContaining({
          traceId: parent.traceId,
          parentSpanId: parent.spanId,
          startTime: 1002,
          durationMs: 3,
        }),
      ])
      expect(intervals[0].attributes?.['next.rsc.timing']).toBe(
        'render-interval'
      )
      expect(unrelated).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.__NEXT_DEV_SERVER
      else process.env.__NEXT_DEV_SERVER = previous
    }
  })

  it.each([true, false])(
    'records incomplete render metadata after a budget limit, with earlier intervals: %s',
    async (includeInterval) => {
      const previous = process.env.__NEXT_DEV_SERVER
      process.env.__NEXT_DEV_SERVER = '1'
      registerLocalSpanRecorder()
      const records: SpanStoreRecord[] = []
      try {
        await runWithLocalSpanSink(
          (span) => records.push(span),
          () =>
            getTracer().trace(
              AppRenderSpan.renderToReadableStream,
              async () => {
                const render = createLocalRenderTiming()!
                render.start()
                if (includeInterval) {
                  render.readFlightChunk(flight)
                  render.readDebugChunk(debug)
                  await Promise.resolve()
                }
                render.readDebugChunk(
                  Array.from(
                    { length: 2100 },
                    (_, i) => `${(i + 4).toString(16)}:{"name":"unused"}\n`
                  ).join('')
                )
                render.finishFlight()
                render.finishDebug()
              }
            )
        )
        const incomplete = records.filter(
          (span) => span.name === 'ReactServerComponents.incomplete'
        )
        expect(incomplete).toHaveLength(1)
        expect(incomplete[0].attributes).toMatchObject({
          'next.rsc.render_id': expect.any(String),
          'next.rsc.incomplete_reason': 'budget',
        })
        if (includeInterval) {
          const interval = records.find(
            (span) => span.name === 'ReactServerComponents.component'
          )!
          expect(incomplete[0].attributes!['next.rsc.render_id']).toBe(
            interval.attributes!['next.rsc.render_id']
          )
        }
      } finally {
        if (previous === undefined) delete process.env.__NEXT_DEV_SERVER
        else process.env.__NEXT_DEV_SERVER = previous
      }
    }
  )

  it('does not create a React collector outside the dev server', () => {
    const previous = process.env.__NEXT_DEV_SERVER
    delete process.env.__NEXT_DEV_SERVER
    try {
      runWithLocalSpanSink(
        () => {},
        () => {
          expect(createLocalRenderTiming()).toBeUndefined()
        }
      )
    } finally {
      if (previous !== undefined) process.env.__NEXT_DEV_SERVER = previous
    }
  })

  it('publishes completed intervals before either stream ends', async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(debug)
    await Promise.resolve()

    expect(timings).toEqual([
      {
        id: '0:0',
        kind: 'component',
        name: 'Page',
        environment: 'Server',
        startTime: 1002,
        durationMs: 3,
      },
    ])
    collector.finish()
    expect(timings).toHaveLength(1)
  })

  it('keeps adjacent components when React does not advance the task clock', async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(
      ':N1000\n0:D{"time":2}\n0:D{"name":"Outer","env":"Server"}\n'
    )
    await Promise.resolve()
    expect(timings).toEqual([])
    collector.readFlightChunk(
      '0:D{"name":"Inner","env":"Server"}\n0:D{"time":5}\n'
    )
    collector.finish()
    expect(
      timings.map(({ name, startTime, durationMs }) => ({
        name,
        startTime,
        durationMs,
      }))
    ).toEqual([
      { name: 'Outer', startTime: 1002, durationMs: 0 },
      { name: 'Inner', startTime: 1002, durationMs: 3 },
    ])
  })

  it.each(['component', 'await'])(
    'retains a %s followed by an await without an intervening timestamp',
    (kind) => {
      const timings: ReactTimingRecord[] = []
      const incomplete = jest.fn()
      const collector = createReactTimingCollector(
        (batch) => timings.push(...batch),
        incomplete
      )
      collector.readFlightChunk('0:D"$1"\n0:D"$2"\n0:D"$3"\n0:D"$4"\n')
      collector.readDebugChunk(
        ':N1000\n1:{"time":2}\n2:' +
          (kind === 'component'
            ? '{"name":"CachedTree","env":"Server"}'
            : '{"awaited":"$@5","env":"Server"}') +
          '\n3:{"awaited":"$@5","env":"Server"}\n4:{"time":5}\n5:J{"name":"cache","env":"Server","start":1,"end":100}\n'
      )
      collector.finish()
      expect(timings).toEqual([
        expect.objectContaining({ kind, startTime: 1002, durationMs: 3 }),
        expect.objectContaining({
          kind: 'await',
          startTime: 1002,
          durationMs: 3,
        }),
      ])
      expect(incomplete).not.toHaveBeenCalled()
    }
  )

  it('reports missing timing references only once both streams have finished', async () => {
    const onTruncated = jest.fn()
    const collector = createReactTimingCollector(() => {}, onTruncated)
    collector.readFlightChunk(flight)
    collector.readDebugChunk(':N1000\n1:{"time":2}\n2:{"name":"Page"}\n')
    await Promise.resolve()
    expect(onTruncated).not.toHaveBeenCalled()
    collector.finish()
    expect(onTruncated).toHaveBeenCalledTimes(1)
    expect(onTruncated).toHaveBeenCalledWith('protocol')
  })

  it('handles byte-split rows and debug models arriving after Flight', async () => {
    const { collector, timings } = setup()
    const encoder = new TextEncoder()
    for (const byte of encoder.encode('~' + flight)) {
      collector.readFlightChunk(Uint8Array.of(byte))
    }
    await Promise.resolve()
    expect(timings).toEqual([])

    for (const byte of encoder.encode(debug.replace('Page', 'Págé'))) {
      collector.readDebugChunk(Uint8Array.of(byte))
    }
    collector.finish()
    expect(timings).toEqual([
      expect.objectContaining({ name: 'Págé', durationMs: 3 }),
    ])
  })

  it('handles every split point between complete and fragmented UTF-8 rows', () => {
    const bytes = new TextEncoder().encode(debug.replace('Page', 'Págé 🐸'))
    for (let split = 0; split <= bytes.length; split++) {
      const { collector, timings } = setup()
      collector.readFlightChunk(flight)
      collector.readDebugChunk(bytes.subarray(0, split))
      collector.readDebugChunk(bytes.subarray(split))
      collector.finish()
      expect(timings).toEqual([
        expect.objectContaining({ name: 'Págé 🐸', durationMs: 3 }),
      ])
    }
  })

  it('applies the row budget to complete rows without losing later timings', () => {
    const onTruncated = jest.fn()
    const timings: ReactTimingRecord[] = []
    const collector = createReactTimingCollector(
      (batch) => timings.push(...batch),
      onTruncated
    )
    collector.readDebugChunk(
      'a:{"name":"' + 'x'.repeat(1024 * 1024) + '"}\n' + debug
    )
    collector.readFlightChunk(flight)
    collector.finish()
    expect(onTruncated).toHaveBeenCalledTimes(1)
    expect(timings).toEqual([
      expect.objectContaining({ name: 'Page', durationMs: 3 }),
    ])
  })

  it('resolves aliases and awaited I/O without retaining its value', () => {
    const { collector, timings } = setup()
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:"$a"\na:{"awaited":"$@4","env":"Server"}\n3:{"time":5}\n4:J{"name":"fetch","start":0,"end":5,"value":"secret","stack":["secret"]}\n'
    )
    collector.readFlightChunk(flight)
    collector.finish()
    expect(timings).toEqual([
      {
        id: '0:0',
        kind: 'await',
        name: 'fetch',
        environment: 'Server',
        startTime: 1002,
        durationMs: 3,
      },
    ])
  })

  it('keeps distinct tasks and renders even when names and times match', () => {
    const first = setup()
    const second = setup()
    first.collector.readFlightChunk(flight + flight.replaceAll('0:D', 'f:D'))
    second.collector.readFlightChunk(flight)
    first.collector.readDebugChunk(debug)
    second.collector.readDebugChunk(debug.replace('Page', 'OtherPage'))
    first.collector.finish()
    second.collector.finish()
    expect(first.timings.map((timing) => timing.id)).toEqual(['0:0', 'f:0'])
    expect(second.timings).toEqual([
      expect.objectContaining({ id: '0:0', name: 'OtherPage' }),
    ])
  })

  it("uses React's explicit await owner, including when its model arrives later", async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:{"awaited":"$@4","env":"Server","owner":"$5"}\n3:{"time":5}\n4:J{"name":"setTimeout","owner":"$6","value":"secret"}\n6:{"name":"Creator"}\n'
    )
    await Promise.resolve()
    expect(timings).toEqual([])
    collector.readDebugChunk(
      '5:{"name":"WarehousePanel","props":{"secret":"hidden"},"stack":["private"]}\n'
    )
    collector.finish()
    expect(timings).toEqual([
      {
        id: '0:0',
        kind: 'await',
        name: 'setTimeout',
        ownerName: 'WarehousePanel',
        componentPath: 'WarehousePanel',
        environment: 'Server',
        startTime: 1002,
        durationMs: 3,
      },
    ])
  })

  it('does not use the I/O creator as an unknown await owner', () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(
      ':N1000\n1:{"time":2}\n2:{"awaited":"$@4","env":"Server"}\n3:{"time":5}\n4:J{"name":"setTimeout","owner":"$6"}\n6:{"name":"Creator"}\n'
    )
    collector.finish()
    expect(timings).toEqual([
      {
        id: '0:0',
        kind: 'await',
        name: 'setTimeout',
        environment: 'Server',
        startTime: 1002,
        durationMs: 3,
      },
    ])
  })

  it('reads inline timings and skips binary payloads containing apparent rows', () => {
    const { collector, timings } = setup()
    const payload = '0:D{"name":"NotAComponent"}\n'
    collector.readFlightChunk(
      ':N1000\n9:T' +
        payload.length.toString(16) +
        ',' +
        payload +
        '0:D{"time":2}\n0:D{"name":"Page","env":"Server"}\n0:D{"time":5}\n'
    )
    collector.finish()
    expect(timings).toEqual([
      expect.objectContaining({ name: 'Page', durationMs: 3 }),
    ])
  })

  it('ignores malformed references and cyclic aliases without inventing timings', () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(':N1000\n1:"$2"\n2:"$1"\n3:{"time":5}\n')
    collector.readFlightChunk('1:D"$1:props"\n1:D"$2junk"\n1:D"$3"\n')
    collector.finish()
    expect(timings).toEqual([])
  })

  it('drops incomplete work on abort and ignores subsequent chunks', async () => {
    const { collector, timings } = setup()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(debug)
    collector.abort()
    await Promise.resolve()
    collector.readFlightChunk(flight)
    collector.readDebugChunk(debug)
    collector.finish()
    expect(timings).toEqual([])
  })

  it('bounds input, incomplete rows and completed output', () => {
    const { collector, timings } = setup()
    collector.readDebugChunk(debug)
    const rows = Array.from({ length: 1500 }, (_, task) =>
      flight.replaceAll('0:D', task.toString(16) + ':D')
    ).join('')
    collector.readFlightChunk(rows)
    collector.finish()
    expect(timings.length).toBeGreaterThan(0)
    expect(timings.length).toBeLessThan(1500)

    const oversized = setup()
    oversized.collector.readDebugChunk('1:{"name":"' + 'x'.repeat(1024 * 1024))
    oversized.collector.readDebugChunk('"}\n' + debug)
    oversized.collector.readFlightChunk(flight)
    oversized.collector.finish()
    expect(oversized.timings).toHaveLength(1)

    const exhausted = setup()
    exhausted.collector.readDebugChunk('x'.repeat(9 * 1024 * 1024))
    exhausted.collector.readDebugChunk(debug)
    exhausted.collector.readFlightChunk(flight)
    exhausted.collector.finish()
    expect(exhausted.timings).toEqual([])
  })

  it('does not let an exporter exception escape into rendering', async () => {
    const collector = createReactTimingCollector(() => {
      throw new Error('export failed')
    })
    collector.readDebugChunk(debug)
    collector.readFlightChunk(flight)
    await Promise.resolve()
    expect(() => collector.finish()).not.toThrow()
  })

  it('reports exhausted parser budgets once, but not an explicit abort', () => {
    const onTruncated = jest.fn(() => {
      throw new Error('diagnostic failed')
    })
    const collector = createReactTimingCollector(() => {}, onTruncated)
    collector.readDebugChunk('1:{"name":"' + 'x'.repeat(1024 * 1024))
    collector.readDebugChunk('x'.repeat(9 * 1024 * 1024))
    collector.readDebugChunk(debug)
    collector.finish()
    expect(onTruncated).toHaveBeenCalledTimes(1)

    onTruncated.mockClear()
    createReactTimingCollector(() => {}, onTruncated).abort()
    expect(onTruncated).not.toHaveBeenCalled()
  })
})
