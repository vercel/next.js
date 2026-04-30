import { mkdtemp, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  convertNextTraceToChromeEventFormat,
  listTraceSessions,
} from './to-chrome-event-format'
import type { TraceEvent } from './types'

async function writeFixture(events: TraceEvent[][]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'next-trace-perfetto-'))
  const filePath = join(dir, 'trace')
  await writeFile(
    filePath,
    events.map((line) => JSON.stringify(line)).join('\n') + '\n'
  )
  return filePath
}

describe('convertNextTraceToChromeEventFormat', () => {
  it('emits begin/end events for a single root span', async () => {
    const filePath = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 1000, duration: 500 }],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)

    expect(result.traceEvents).toEqual([
      expect.objectContaining({ name: 'root', ph: 'B', ts: 1000 }),
      expect.objectContaining({ name: 'root', ph: 'E', ts: 1500 }),
    ])
  })

  it('reconstructs nested spans across NDJSON lines and out-of-order events', async () => {
    // Child appears in the file BEFORE the parent, on a separate line, to
    // exercise the parent/child reconstruction step.
    const filePath = await writeFixture([
      [
        {
          name: 'child',
          id: 2,
          parentId: 1,
          timestamp: 1100,
          duration: 200,
          startTime: 1100,
        },
      ],
      [
        {
          name: 'root',
          id: 1,
          timestamp: 1000,
          duration: 500,
          startTime: 1000,
        },
      ],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)

    // Order: B(root), B(child), E(child), E(root).
    expect(result.traceEvents.map((e) => [e.name, e.ph, e.ts])).toEqual([
      ['root', 'B', 1000],
      ['child', 'B', 1100],
      ['child', 'E', 1300],
      ['root', 'E', 1500],
    ])
  })

  it('orders sibling children chronologically by startTime', async () => {
    const filePath = await writeFixture([
      [
        { name: 'root', id: 1, timestamp: 0, duration: 1000, startTime: 0 },
        {
          name: 'first',
          id: 2,
          parentId: 1,
          timestamp: 100,
          duration: 100,
          startTime: 100,
        },
        {
          name: 'second',
          id: 3,
          parentId: 1,
          timestamp: 300,
          duration: 100,
          startTime: 300,
        },
      ],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)
    const beginNames = result.traceEvents
      .filter((e) => e.ph === 'B')
      .map((e) => e.name)

    expect(beginNames).toEqual(['root', 'first', 'second'])
  })

  it('collapses build-module-* spans to their package name', async () => {
    const filePath = await writeFixture([
      [
        {
          name: 'build-module-foo',
          id: 1,
          timestamp: 0,
          duration: 100,
          tags: { name: '/proj/node_modules/react/index.js' },
        },
      ],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)

    expect(result.traceEvents[0].args).toMatchObject({ name: 'react' })
  })

  it('drops nested build-module-* spans for the same package and surfaces grandchildren', async () => {
    const filePath = await writeFixture([
      [
        {
          name: 'build-module-parent',
          id: 1,
          timestamp: 0,
          duration: 1000,
          startTime: 0,
          tags: { name: '/proj/node_modules/react/index.js' },
        },
        // Same package as parent → should be skipped, but its children should
        // be re-parented to the original parent.
        {
          name: 'build-module-self',
          id: 2,
          parentId: 1,
          timestamp: 100,
          duration: 800,
          startTime: 100,
          tags: { name: '/proj/node_modules/react/lib/inner.js' },
        },
        // Grandchild from a different package should be preserved under the
        // top-level "react" span.
        {
          name: 'build-module-grandchild',
          id: 3,
          parentId: 2,
          timestamp: 200,
          duration: 100,
          startTime: 200,
          tags: { name: '/proj/node_modules/lodash/index.js' },
        },
      ],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)
    const beginEvents = result.traceEvents.filter((e) => e.ph === 'B')

    expect(beginEvents.map((e) => e.args?.name)).toEqual(['react', 'lodash'])
  })

  it('preserves tag values as args on the begin/end events', async () => {
    const filePath = await writeFixture([
      [
        {
          name: 'compile',
          id: 1,
          timestamp: 0,
          duration: 100,
          tags: { entries: 5, ok: true },
        },
      ],
    ])

    const result = await convertNextTraceToChromeEventFormat(filePath)
    expect(result.traceEvents[0].args).toEqual({ entries: 5, ok: true })
    expect(result.traceEvents[1].args).toEqual({ entries: 5, ok: true })
  })

  it('filters by traceId when options.traceId is provided', async () => {
    const filePath = await writeFixture([
      [
        {
          name: 'next-build',
          id: 1,
          traceId: 'a',
          timestamp: 0,
          duration: 1000,
        },
      ],
      [
        {
          name: 'next-dev',
          id: 2,
          traceId: 'b',
          timestamp: 100,
          duration: 500,
        },
      ],
    ])

    const all = await convertNextTraceToChromeEventFormat(filePath)
    const onlyA = await convertNextTraceToChromeEventFormat(filePath, {
      traceId: 'a',
    })
    const onlyB = await convertNextTraceToChromeEventFormat(filePath, {
      traceId: 'b',
    })

    expect(all.traceEvents).toHaveLength(4)
    expect(onlyA.traceEvents.map((e) => e.name)).toEqual([
      'next-build',
      'next-build',
    ])
    expect(onlyB.traceEvents.map((e) => e.name)).toEqual([
      'next-dev',
      'next-dev',
    ])
  })
})

describe('listTraceSessions', () => {
  it('summarises one entry per traceId in file order, with root span name and duration', async () => {
    const filePath = await writeFixture([
      [
        {
          name: 'next-build',
          id: 1,
          traceId: 'a',
          timestamp: 0,
          duration: 1_000,
          startTime: 1_700_000_000_000,
        },
      ],
      [
        {
          name: 'compile',
          id: 2,
          parentId: 1,
          traceId: 'a',
          timestamp: 100,
          duration: 500,
          startTime: 1_700_000_000_100,
        },
      ],
      [
        {
          name: 'next-dev',
          id: 3,
          traceId: 'b',
          timestamp: 2_000,
          duration: 7_500,
          startTime: 1_700_000_010_000,
        },
      ],
    ])

    const sessions = await listTraceSessions(filePath)

    expect(sessions).toEqual([
      {
        traceId: 'a',
        name: 'next-build',
        startTime: 0,
        wallClockStartTime: 1_700_000_000_000,
        duration: 1_000,
        eventCount: 2,
      },
      {
        traceId: 'b',
        name: 'next-dev',
        startTime: 2_000,
        wallClockStartTime: 1_700_000_010_000,
        duration: 7_500,
        eventCount: 1,
      },
    ])
  })

  it('falls back to the empty traceId for events without one', async () => {
    const filePath = await writeFixture([
      [{ name: 'root', id: 1, timestamp: 0, duration: 100 }],
    ])

    const sessions = await listTraceSessions(filePath)

    expect(sessions).toEqual([
      {
        traceId: '',
        name: 'root',
        startTime: 0,
        wallClockStartTime: null,
        duration: 100,
        eventCount: 1,
      },
    ])
  })

  it("uses a non-root child's startTime as a fallback wall-clock anchor", async () => {
    // Pathological case: the root span lacks a startTime but its child has
    // one. We should still surface a wall-clock value rather than null.
    const filePath = await writeFixture([
      [
        {
          name: 'next-build',
          id: 1,
          traceId: 'a',
          timestamp: 0,
          duration: 1_000,
        },
      ],
      [
        {
          name: 'compile',
          id: 2,
          parentId: 1,
          traceId: 'a',
          timestamp: 100,
          duration: 500,
          startTime: 1_700_000_000_500,
        },
      ],
    ])

    const sessions = await listTraceSessions(filePath)

    expect(sessions).toEqual([
      {
        traceId: 'a',
        name: 'next-build',
        startTime: 0,
        wallClockStartTime: 1_700_000_000_500,
        duration: 1_000,
        eventCount: 2,
      },
    ])
  })
})
