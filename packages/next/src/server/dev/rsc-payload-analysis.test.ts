import { readFileSync } from 'fs'
import path from 'path'
import type { RequestInsightRscPayload } from '../../shared/lib/request-insights'
import { analyzeRscPayload, RscPayloadAnalyzer } from './rsc-payload-analysis'

const encoder = new TextEncoder()

function clientReference(name: string, modulePath = 'app/client.tsx') {
  return `I["[project]/${modulePath} [app-client] (ecmascript)",[],"${name}"]`
}

function rows(...lines: string[]): string {
  return lines.map((line) => `${line}\n`).join('')
}

function analyze(payload: string | Uint8Array, complete = true) {
  return analyzeRscPayload(
    typeof payload === 'string' ? encoder.encode(payload) : payload,
    complete
  )
}

function bytes(value: string) {
  return Buffer.byteLength(value)
}

function expectInvariant(result: RequestInsightRscPayload) {
  const attributed =
    (result.boundaries ?? []).reduce((sum, b) => sum + b.bytes, 0) +
    (result.otherBoundariesBytes ?? 0) +
    (result.frameworkBoundariesBytes ?? 0) +
    (result.sharedBytes ?? 0)
  expect(attributed).toBeLessThanOrEqual(result.estimatedBytes!)
}

describe('analyzeRscPayload', () => {
  it('attributes inline props to the receiving client component', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,{"rows":[1,2,3]}]`
    )
    const result = analyze(payload)
    expect(result).toEqual({
      status: 'complete',
      estimatedBytes: bytes(payload),
      boundaries: [
        {
          name: 'app/client.tsx#Table',
          instances: 1,
          bytes: bytes('{"rows":[1,2,3]}'),
          largestInstanceBytes: bytes('{"rows":[1,2,3]}'),
        },
      ],
      otherBoundariesBytes: 0,
      frameworkBoundariesBytes: 0,
      sharedBytes: 0,
    })
  })

  it('puts a row referenced by two boundaries into shared, even if emitted before the root', () => {
    const payload = rows(
      `1:${clientReference('First')}`,
      `2:${clientReference('Second')}`,
      `3:{"v":"xxxxxxxxxx"}`,
      `0:[["$","$L1",null,{"data":"$3"}],["$","$L2",null,{"data":"$3"}]]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.sharedBytes).toBe(bytes('{"v":"xxxxxxxxxx"}'))
    expect(result.boundaries).toEqual([
      {
        name: 'app/client.tsx#First',
        instances: 1,
        bytes: bytes('{"data":"$3"}'),
        largestInstanceBytes: bytes('{"data":"$3"}'),
      },
      {
        name: 'app/client.tsx#Second',
        instances: 1,
        bytes: bytes('{"data":"$3"}'),
        largestInstanceBytes: bytes('{"data":"$3"}'),
      },
    ])
    expectInvariant(result)
  })

  it('puts a row referenced by a boundary and by server content into shared', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `2:{"v":"xxxxxxxxxx"}`,
      `0:[["$","$L1",null,{"data":"$2"}],["$","div",null,{"title":"$2"}]]`
    )
    const result = analyze(payload)
    expect(result.sharedBytes).toBe(bytes('{"v":"xxxxxxxxxx"}'))
    expect(result.boundaries?.[0].bytes).toBe(bytes('{"data":"$2"}'))
    expectInvariant(result)
  })

  it('attributes an outlined props object to its boundary', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `5:{"own":"abcdefghij"}`,
      `0:["$","$L1",null,"$5"]`
    )
    const result = analyze(payload)
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('"$5"') + bytes('{"own":"abcdefghij"}')
    )
    expect(result.sharedBytes).toBe(0)
  })

  it('does not double count a boundary nested in an outlined props row', () => {
    const payload = rows(
      `1:${clientReference('Shell')}`,
      `2:${clientReference('Table')}`,
      `3:{"children":["$","$L2",null,{"data":"0123456789"}]}`,
      `0:["$","$L1",null,"$3"]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries).toEqual([
      {
        name: 'app/client.tsx#Table',
        instances: 1,
        bytes: bytes('{"data":"0123456789"}'),
        largestInstanceBytes: bytes('{"data":"0123456789"}'),
      },
      {
        name: 'app/client.tsx#Shell',
        instances: 1,
        // "$3" plus `{"children":` and the closing brace; the nested element
        // is a slot, not Shell's data.
        bytes: bytes('"$3"') + bytes('{"children":}'),
        largestInstanceBytes: bytes('"$3"') + bytes('{"children":}'),
      },
    ])
    expectInvariant(result)
  })

  it('aggregates instances by component', () => {
    const payload = rows(
      `1:${clientReference('Item')}`,
      `0:[["$","$L1","a",{"v":"x"}],["$","$L1","b",{"v":"xxx"}]]`
    )
    expect(analyze(payload).boundaries).toEqual([
      {
        name: 'app/client.tsx#Item',
        instances: 2,
        bytes: bytes('{"v":"x"}') + bytes('{"v":"xxx"}'),
        largestInstanceBytes: bytes('{"v":"xxx"}'),
      },
    ])
  })

  it('counts multi-byte UTF-8 strings by bytes', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,{"s":"héllo €"}]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries?.[0].bytes).toBe(bytes('{"s":"héllo €"}'))
  })

  it('counts length-prefixed text rows by their wire length', () => {
    const text = 'héllo\nworld'
    const payload =
      `1:${clientReference('Table')}\n` +
      `4:T${bytes(text).toString(16)},${text}` +
      `0:["$","$L1",null,{"t":"$4"}]\n`
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries?.[0].bytes).toBe(bytes('{"t":"$4"}') + bytes(text))
  })

  it('counts binary rows by their wire length', () => {
    const binary = new Uint8Array([0x0a, 0xff, 0x00, 0x3a])
    const payload = Buffer.concat([
      encoder.encode(`1:${clientReference('Table')}\n`),
      encoder.encode(`6:o${binary.byteLength.toString(16)},`),
      binary,
      encoder.encode(`0:["$","$L1",null,{"b":"$6"}]\n`),
    ])
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(payload.byteLength)
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('{"b":"$6"}') + binary.byteLength
    )
  })

  it('counts every row of a stream that shares one id', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,{"stream":"$2"}]`,
      `2:R`,
      `2:"chunk one"`,
      `2:"chunk two"`,
      `2:C`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('{"stream":"$2"}') + bytes('"chunk one"') + bytes('"chunk two"')
    )
  })

  it('gives the same result regardless of chunk boundaries', () => {
    const text = 'héllo'
    const payload = encoder.encode(
      `1:${clientReference('Table')}\n` +
        `4:T${bytes(text).toString(16)},${text}` +
        `0:["$","$L1",null,{"t":"$4","s":"€uro"}]\n`
    )
    const analyzer = new RscPayloadAnalyzer()
    for (let i = 0; i < payload.byteLength; i++) {
      analyzer.write(payload.subarray(i, i + 1))
    }
    expect(analyzer.end(true)).toEqual(analyze(payload))
  })

  it('accepts string chunks', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,{"s":"€"}]`
    )
    const analyzer = new RscPayloadAnalyzer()
    analyzer.write(payload.slice(0, 10))
    analyzer.write(payload.slice(10))
    expect(analyzer.end(true)).toEqual(analyze(payload))
  })

  it('excludes dev-only debug rows, element debug fields and data only they reference', () => {
    const production = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,{"v":"x"}]`
    )
    const development = rows(
      `1:${clientReference('Table')}`,
      `2:{"name":"Page","env":"Server","key":null,"owner":null}`,
      `3:{"stack":"at Page (app/page.tsx:1:1)"}`,
      `0:D"$2"`,
      `0:["$","$L1",null,{"v":"x"},"$2","$3",1]`,
      `4:W["log","$5","Server","hello"]`,
      `5:{"onlyReferencedByConsole":true}`,
      `6:J{"name":"fetch"}`,
      `7:N1234.5`
    )
    const result = analyze(development)
    expect(result.estimatedBytes).toBe(bytes(production))
    expect(result).toEqual(analyze(production))
  })

  it('keeps data referenced from both debug and real positions', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `2:{"shared":"value"}`,
      `0:D"$2"`,
      `0:["$","$L1",null,{"v":"$2"},"$2",null,1]`
    )
    const production = rows(
      `1:${clientReference('Table')}`,
      `2:{"shared":"value"}`,
      `0:["$","$L1",null,{"v":"$2"}]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(production))
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('{"v":"$2"}') + bytes('{"shared":"value"}')
    )
  })

  it('excludes inline debug data emitted without a debug channel', () => {
    const production = rows(
      `1:${clientReference('Table')}`,
      `0:["$","div",null,{"children":["$","$L1",null,{"v":1}]}]`
    )
    const development = rows(
      `1:${clientReference('Table')}`,
      `2:{"name":"Page","env":"Server","key":null,"owner":null,"stack":[["Page","app/page.tsx",1,1]],"props":{}}`,
      `3:D"$2"`,
      `3:{"time":1.5}`,
      `0:D"$2"`,
      `0:["$","div",null,{"children":["$","$L1",null,{"v":1},"$2",[["Page","app/page.tsx",2,3]],1]},"$2",[["Page","app/page.tsx",2,3]],1]`
    )
    expect(analyze(development)).toEqual(analyze(production))
  })

  it('groups Next.js internal boundaries and lists at most 10 components', () => {
    const lines = [
      `1:I["[project]/node_modules/next/dist/client/components/layout-router.js [app-client] (ecmascript)",[],"default"]`,
    ]
    const elements = [`["$","$L1",null,{"internal":"xxxx"}]`]
    for (let i = 0; i < 12; i++) {
      const id = (i + 2).toString(16)
      lines.push(`${id}:${clientReference(`C${i}`)}`)
      elements.push(`["$","$L${id}",null,{"v":"${'x'.repeat(i + 1)}"}]`)
    }
    lines.push(`0:[${elements.join(',')}]`)
    const result = analyze(rows(...lines))
    expect(result.frameworkBoundariesBytes).toBe(bytes('{"internal":"xxxx"}'))
    expect(result.boundaries).toHaveLength(10)
    expect(result.boundaries?.[0].name).toBe('app/client.tsx#C11')
    expect(result.boundaries?.map((b) => b.name)).not.toContain(
      'app/client.tsx#C0'
    )
    expect(result.otherBoundariesBytes).toBe(
      bytes('{"v":"x"}') + bytes('{"v":"xx"}')
    )
    expectInvariant(result)
  })

  it('resolves outlined module id strings and strips webpack prefixes', () => {
    const payload = rows(
      `2:"(app-pages-browser)/./app/table.tsx"`,
      `1:I["$2",[],"Table"]`,
      `0:["$","$L1",null,{}]`
    )
    expect(analyze(payload).boundaries?.[0].name).toBe('app/table.tsx#Table')
  })

  it('never stores absolute module paths', () => {
    const payload = rows(
      `1:I["/home/user/project/app/table.tsx",[],"Table"]`,
      `0:["$","$L1",null,{}]`
    )
    expect(analyze(payload).boundaries?.[0].name).toBe('table.tsx#Table')
  })

  it('applies the module path normalizer', () => {
    const payload = rows(
      `1:${clientReference('Table', 'apps/web/app/table.tsx')}`,
      `0:["$","$L1",null,{}]`
    )
    const result = analyzeRscPayload(encoder.encode(payload), true, {
      normalizeModulePath: (modulePath) =>
        modulePath.replace(/^apps\/web\//, ''),
    })
    expect(result.boundaries?.[0].name).toBe('app/table.tsx#Table')
  })

  it('reports an incomplete stream without a breakdown', () => {
    const complete = rows(
      `1:${clientReference('Table')}`,
      `0:["$","$L1",null,"$2"]`
    )
    const truncated = complete + '2:{"rows":[1,2'
    expect(analyze(truncated, false)).toEqual({
      status: 'incomplete',
      estimatedBytes: bytes(complete),
    })
  })

  it('reports payloads over the analysis limit as unavailable', () => {
    const analyzer = new RscPayloadAnalyzer({ maxBytes: 10 })
    analyzer.write(encoder.encode('0:"xxxxxxxxxxxxxxxx"\n'))
    expect(analyzer.end(true)).toEqual({
      status: 'unavailable',
      unavailableReason: 'too-large',
    })
  })

  it.each([
    ['a truncated row', '0:["$","div",null,{}'],
    ['invalid JSON', '0:{not json}\n'],
    ['an invalid row id', 'zz:null\n'],
    ['an unknown row tag', '0:Qnot-a-known-tag\n'],
    ['an unresolved reachable reference', '0:"$1"\n'],
    ['an unresolved property path', '1:{"a":1}\n0:"$1:b"\n'],
  ])('reports %s in a completed stream as a parse error', (_, payload) => {
    expect(analyze(payload)).toEqual({
      status: 'unavailable',
      unavailableReason: 'parse-error',
    })
  })

  it('reports invalid UTF-8 in a completed stream as a parse error', () => {
    const payload = Buffer.concat([
      encoder.encode('0:"'),
      new Uint8Array([0xff]),
      encoder.encode('"\n'),
    ])
    expect(analyze(payload)).toEqual({
      status: 'unavailable',
      unavailableReason: 'parse-error',
    })
  })

  it('ignores unresolved references from debug-only positions', () => {
    // With a debug channel, debug info rows reference rows sent on the channel.
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:D"$9"`,
      `0:["$","$L1",null,{"v":1},"$9","$a",1]`
    )
    expect(analyze(payload).status).toBe('complete')
  })

  it('accepts a time origin row without an id', () => {
    const payload = ':N1794929540137.2166\n0:null\n'
    expect(analyze(payload)).toEqual(
      expect.objectContaining({ status: 'complete', estimatedBytes: 7 })
    )
  })

  it('shares an inline object that another boundary references by property path', () => {
    // React dedupes an object passed twice by referencing its first position.
    // Paths address elements by field name (`props`), like the Flight client.
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:[["$","$L1",null,{"v":{"x":"12345678901234567890"}}],["$","$L1",null,{"v":"$0:0:props:v"}]]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.sharedBytes).toBe(bytes('{"x":"12345678901234567890"}'))
    expect(result.boundaries).toEqual([
      {
        name: 'app/client.tsx#Table',
        instances: 2,
        bytes: bytes('{"v":}') + bytes('{"v":"$0:0:props:v"}'),
        largestInstanceBytes: bytes('{"v":"$0:0:props:v"}'),
      },
    ])
    expectInvariant(result)
  })

  it('shares a subtree referenced by property path from server content', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `0:[["$","$L1",null,{"v":{"x":1}}],["$","div",null,{"title":"$0:0:props:v:x"}]]`
    )
    const result = analyze(payload)
    expect(result.sharedBytes).toBe(bytes('1'))
    expect(result.boundaries?.[0].bytes).toBe(bytes('{"v":{"x":}}'))
    expectInvariant(result)
  })

  it('follows chains of outlined references and terminates on cycles', () => {
    const payload = rows(
      `1:${clientReference('Table')}`,
      `2:{"next":"$3","self":"$2"}`,
      `3:{"leaf":"abc","back":"$2:next"}`,
      `0:["$","$L1",null,{"data":"$2"}]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('{"data":"$2"}') +
        bytes('{"next":"$3","self":"$2"}') +
        bytes('{"leaf":"abc","back":"$2:next"}')
    )
    expect(result.sharedBytes).toBe(0)
  })

  it('keeps the rows a property path goes through in the estimate', () => {
    // The selected value belongs to the boundary; the rest of the rows it is
    // selected from is still sent, but is nobody's data.
    const payload = rows(
      `1:${clientReference('Table')}`,
      `2:{"v":"some data","other":"not selected"}`,
      `3:"$2"`,
      `0:["$","$L1",null,{"data":"$3:v"}]`
    )
    const result = analyze(payload)
    expect(result.estimatedBytes).toBe(bytes(payload))
    expect(result.boundaries?.[0].bytes).toBe(
      bytes('{"data":"$3:v"}') + bytes('"some data"')
    )
    expect(result.sharedBytes).toBe(0)
    expectInvariant(result)
  })

  it('counts hint rows and validates them', () => {
    const payload = rows(`:HL["/_next/static/css/app.css","style"]`, `0:null`)
    expect(analyze(payload).estimatedBytes).toBe(bytes(payload))
  })

  it.each([
    ['an unknown hint code', ':HQ["x"]\n0:null\n'],
    ['invalid hint JSON', ':HL[not json\n0:null\n'],
    ['an empty row length', '1:T,0:null\n'],
  ])('reports %s as a parse error', (_, payload) => {
    expect(analyze(payload)).toEqual({
      status: 'unavailable',
      unavailableReason: 'parse-error',
    })
  })

  it('measures error rows in their production shape', () => {
    const development = rows(
      `1:E{"digest":"123","name":"Error","message":"boom","stack":[["Page","app/page.tsx",1,1]],"env":"Server","owner":null}`,
      `0:"$Z1"`
    )
    const production = rows(`1:E{"digest":"123"}`, `0:"$Z1"`)
    expect(analyze(development)).toEqual(analyze(production))
    expect(analyze(production).estimatedBytes).toBe(bytes(production))
  })

  it('does not resolve property paths through prototypes', () => {
    const payload = rows(`1:{"a":1}`, `0:"$1:constructor"`)
    expect(analyze(payload)).toEqual({
      status: 'unavailable',
      unavailableReason: 'parse-error',
    })
  })

  describe('payloads captured from the vendored React dev build', () => {
    // Captured from a dev page that renders Shell > [Small, BigTable] and a
    // second BigTable, passing the same `meta` object to both BigTables and a
    // slice of the first BigTable's rows to the second. The raw payloads are
    // 6,272 bytes (debug channel) and 13,358 bytes (no debug channel).
    function readFixture(name: string) {
      return readFileSync(
        path.join(__dirname, '__fixtures__', 'rsc-payload', name)
      )
    }
    const withDebugChannel = analyze(readFixture('debug-channel-on.flight'))
    const withoutDebugChannel = analyze(readFixture('debug-channel-off.flight'))

    it.each([
      ['with a debug channel', withDebugChannel],
      ['without a debug channel', withoutDebugChannel],
    ])('analyzes a payload %s', (_, result) => {
      expect(result).toEqual({
        status: 'complete',
        estimatedBytes: 5397,
        boundaries: [
          {
            name: 'rscapp/app/client.js#BigTable',
            instances: 2,
            bytes: 269,
            largestInstanceBytes: 174,
          },
          {
            name: 'rscapp/app/client.js#Shell',
            instances: 1,
            bytes: 34,
            largestInstanceBytes: 34,
          },
          {
            name: 'rscapp/app/client.js#Small',
            instances: 1,
            bytes: 24,
            largestInstanceBytes: 24,
          },
        ],
        otherBoundariesBytes: 0,
        frameworkBoundariesBytes: 1139,
        // The `meta` object and the two row objects that the second BigTable
        // reuses are referenced by property path.
        sharedBytes:
          bytes('{"tag":"shared-object"}') +
          bytes('{"id":0,"name":"user-0"}') +
          bytes('{"id":1,"name":"user-1"}'),
      })
      expectInvariant(result)
    })

    it('estimates the same size with and without a debug channel', () => {
      expect(withoutDebugChannel).toEqual(withDebugChannel)
    })
  })
})
