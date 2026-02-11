'use strict'

// Benchmark: JSON.parse reviver vs post-process walk
// Tests the actual production code path through initializeModelChunk.
//
// Run: node --expose-gc bench-rsc-walk.js

const { performance } = require('perf_hooks')
const fs = require('fs')
const path = require('path')

const BASE =
  'packages/next/dist/compiled/react-server-dom-turbopack/cjs'
const MODIFIED_FILE = path.join(BASE, 'react-server-dom-turbopack-client.node.production.js')
const BACKUP_FILE = path.join(BASE, 'react-server-dom-turbopack-client.node.production.js.bak')

// We can't require both files directly since they'd cache. Instead, we extract
// the key functions using a sandboxed require via vm module.
const vm = require('vm')

function loadModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const mod = { exports: {} }
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: require,
    console: console,
    Error: Error,
    Symbol: Symbol,
    Promise: Promise,
    Object: Object,
    Array: Array,
    Map: Map,
    Set: Set,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    BigInt: BigInt,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Infinity: Infinity,
    NaN: NaN,
    isNaN: isNaN,
    TextDecoder: require('util').TextDecoder,
    global: {},
    setTimeout: setTimeout,
    queueMicrotask: queueMicrotask,
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: filePath })
  return mod.exports
}

// ─── Generate realistic RSC payloads ────────────────────────────────────────
// These match what the server produces: each row is a JSON string that gets
// stored as a chunk's resolvedModel, then parsed by initializeModelChunk.

// A single element row: ["$","div",null,{"className":"foo","children":"bar"}]
function makeElementRow(tag, props) {
  return JSON.stringify(['$', tag, null, props])
}

function makeSmallPayload() {
  return makeElementRow('div', {
    className: 'container mx-auto px-4',
    children: [
      '$',
      'h1',
      null,
      {
        className: 'text-4xl font-bold',
        children: 'Hello World',
      },
    ],
  })
}

function makeMediumPayload() {
  // A page with nav + content
  const navItems = ['Product', 'Features', 'Pricing', 'About'].map(
    (name) => [
      '$',
      'a',
      null,
      {
        href: '/' + name.toLowerCase(),
        className: 'text-sm font-semibold leading-6 text-gray-900',
        children: name,
      },
    ]
  )
  return makeElementRow('main', {
    className: 'min-h-screen bg-white',
    children: [
      ['$', 'nav', null, { className: 'flex gap-x-12', children: navItems }],
      [
        '$',
        'div',
        null,
        {
          className: 'mx-auto max-w-2xl',
          children: [
            [
              '$',
              'h1',
              null,
              {
                className: 'text-4xl font-bold tracking-tight',
                children: 'Welcome to our platform',
              },
            ],
            [
              '$',
              'p',
              null,
              {
                className: 'mt-6 text-lg leading-8 text-gray-600',
                children:
                  'A comprehensive solution for modern web development with server components.',
              },
            ],
          ],
        },
      ],
    ],
  })
}

function makeLargePayload() {
  // 30-item list (common pattern: tables, feeds)
  const items = Array.from({ length: 30 }, (_, i) => [
    '$',
    'div',
    'item-' + i,
    {
      className: 'flex items-center justify-between border-b py-4',
      children: [
        [
          '$',
          'div',
          null,
          {
            className: 'min-w-0 flex-1',
            children: [
              [
                '$',
                'h3',
                null,
                {
                  className: 'text-base font-semibold leading-7',
                  children: 'Item number ' + i,
                },
              ],
              [
                '$',
                'p',
                null,
                {
                  className: 'text-sm leading-6 text-gray-500',
                  children:
                    'Description for item ' +
                    i +
                    ' with additional context and detail text that extends',
                },
              ],
            ],
          },
        ],
        [
          '$',
          'span',
          null,
          {
            className:
              'inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700',
            children: i % 3 === 0 ? 'Active' : i % 3 === 1 ? 'Pending' : 'Inactive',
          },
        ],
      ],
    },
  ])
  return makeElementRow('div', {
    className: 'divide-y divide-gray-200',
    children: items,
  })
}

function makeXLPayload() {
  // Nested tree: simulates a complex dashboard
  function makeCard(i) {
    return [
      '$',
      'div',
      'card-' + i,
      {
        className: 'rounded-lg border bg-white p-6 shadow-sm',
        children: [
          [
            '$',
            'h3',
            null,
            { className: 'text-lg font-medium', children: 'Card ' + i },
          ],
          [
            '$',
            'p',
            null,
            {
              className: 'text-sm text-gray-500 mt-2',
              children:
                'This card contains information about metric ' +
                i +
                ' with various data points.',
            },
          ],
          [
            '$',
            'div',
            null,
            {
              className: 'mt-4 flex gap-2',
              children: [
                [
                  '$',
                  'span',
                  null,
                  {
                    className: 'text-2xl font-bold',
                    children: '' + (i * 1234),
                  },
                ],
                [
                  '$',
                  'span',
                  null,
                  {
                    className: 'text-sm text-green-600',
                    children: '+' + (i % 20) + '%',
                  },
                ],
              ],
            },
          ],
        ],
      },
    ]
  }

  const sections = Array.from({ length: 4 }, (_, s) => [
    '$',
    'section',
    'section-' + s,
    {
      className: 'mb-8',
      children: [
        [
          '$',
          'h2',
          null,
          {
            className: 'text-xl font-semibold mb-4',
            children: 'Section ' + s,
          },
        ],
        [
          '$',
          'div',
          null,
          {
            className: 'grid grid-cols-3 gap-4',
            children: Array.from({ length: 12 }, (_, c) =>
              makeCard(s * 12 + c)
            ),
          },
        ],
      ],
    },
  ])

  return makeElementRow('div', {
    className: 'container mx-auto p-8',
    children: sections,
  })
}

// ─── Benchmark infrastructure ───────────────────────────────────────────────

const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element')

function countElements(obj) {
  if (!obj || typeof obj !== 'object') return 0
  let count = obj.$$typeof === REACT_ELEMENT_TYPE ? 1 : 0
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      count += countElements(obj[k])
    }
  }
  return count
}

// Simulate what the RSC runtime does: create a response, resolve a chunk,
// then initialize it (which triggers JSON.parse + reviver/walk).
function createTestHarness(moduleExports) {
  return function parsePayload(jsonString) {
    // Create a minimal response using the module's exported createFromFetch
    // infrastructure. We'll simulate the chunk resolution directly.
    //
    // The module doesn't export initializeModelChunk directly, but we can
    // simulate the pipeline by creating a stream and feeding data.

    // We'll use a simpler approach: create a response and manually trigger
    // the parsing path via the public API.
    return null // placeholder - we'll use a different approach
  }
}

// Since the modules don't expose initializeModelChunk directly, we need a
// different approach. We'll extract and benchmark the core functions.
// The most accurate way: use the module's createFromReadableStream and feed
// it real RSC wire-format data.

function makeRSCStream(payloads) {
  // RSC wire format: each row is "ID:TYPE_TAG:JSON\n" or "ID:JSON\n"
  // For model rows (type 0, the default), format is just "ID:JSON\n"
  const encoder = new TextEncoder()
  const chunks = payloads.map((json, i) => {
    // Row format: hex(id) ":" json "\n"
    return encoder.encode(i.toString(16) + ':' + json + '\n')
  })

  let chunkIndex = 0
  return new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++])
      } else {
        controller.close()
      }
    },
  })
}

async function benchmarkModule(label, modulePath, payloads, iterations) {
  // Clear require cache to get fresh module
  delete require.cache[require.resolve(modulePath)]
  const mod = require(modulePath)

  // Warmup: parse all payloads a few times
  for (let w = 0; w < Math.min(100, iterations); w++) {
    for (const json of payloads) {
      const stream = makeRSCStream([json])
      const result = mod.createFromReadableStream(stream, {
        serverConsumerManifest: {
          moduleMap: null,
          serverModuleMap: null,
          moduleLoading: null,
        },
      })
      try {
        await result
      } catch (e) {
        // Chunks might not fully resolve in this simplified setup.
        // That's OK — we're measuring the parse path.
      }
      // Small delay to let the stream complete
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  if (global.gc) global.gc()

  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    for (const json of payloads) {
      const stream = makeRSCStream([json])
      const result = mod.createFromReadableStream(stream, {
        serverConsumerManifest: {
          moduleMap: null,
          serverModuleMap: null,
          moduleLoading: null,
        },
      })
      // Don't await - we just want to measure the sync parse path
      // The stream reading + initializeModelChunk is what we're measuring
    }
    // Let microtasks flush (stream reading is async)
    await new Promise((r) => setTimeout(r, 0))
    times.push(performance.now() - start)
  }

  times.sort((a, b) => a - b)
  return {
    label,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    min: times[0],
  }
}

// ─── Alternative: direct function extraction benchmark ──────────────────────
// More accurate — extracts the core functions and benchmarks them directly
// without stream overhead.

function extractCoreFunctions(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')

  // We need to extract initializeModelChunk and its dependencies.
  // The cleanest way: eval the module in a sandbox and expose internals.

  const mod = { exports: {} }
  const util = require('util')

  // Patch the code to expose internals we need for benchmarking
  const patchedCode =
    code +
    `
;(function() {
  // Expose internals for benchmarking
  module.exports.__benchmark = {
    ResponseInstance: ResponseInstance,
    initializeModelChunk: initializeModelChunk,
    ReactPromise: ReactPromise,
    getChunk: getChunk,
  };
})();
`

  const script = new vm.Script(patchedCode, { filename: filePath })
  const context = vm.createContext({
    module: mod,
    exports: mod.exports,
    require: require,
    console: console,
    global: {},
    process: { env: {} },
    Error: Error,
    TypeError: TypeError,
    RangeError: RangeError,
    Symbol: Symbol,
    Promise: Promise,
    Object: Object,
    Array: Array,
    Map: Map,
    Set: Set,
    WeakMap: WeakMap,
    WeakRef: WeakRef,
    FinalizationRegistry: FinalizationRegistry,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    BigInt: BigInt,
    parseInt: parseInt,
    parseFloat: parseFloat,
    Infinity: Infinity,
    NaN: NaN,
    isNaN: isNaN,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    queueMicrotask: queueMicrotask,
    TextDecoder: util.TextDecoder,
    ReadableStream: typeof ReadableStream !== 'undefined' ? ReadableStream : undefined,
    Headers: typeof Headers !== 'undefined' ? Headers : undefined,
    Blob: typeof Blob !== 'undefined' ? Blob : undefined,
    FormData: typeof FormData !== 'undefined' ? FormData : undefined,
    Date: Date,
    RegExp: RegExp,
    JSON: JSON,
    Math: Math,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Proxy: Proxy,
    Reflect: Reflect,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
  })

  script.runInContext(context)
  return mod.exports.__benchmark
}

function directBenchmark(label, internals, payloads, iterations) {
  const { ResponseInstance, initializeModelChunk, ReactPromise, getChunk } = internals

  // Create a response instance
  function makeResponse() {
    return new ResponseInstance(
      null, // bundlerConfig
      null, // serverReferenceConfig
      null, // moduleLoading
      undefined, // callServer
      undefined, // encodeFormAction
      undefined, // nonce
      undefined // temporaryReferences
    )
  }

  // Simulate how initializeModelChunk is called:
  // 1. A chunk is created with status "resolved_model"
  // 2. chunk.value = JSON string, chunk.reason = response
  // 3. initializeModelChunk(chunk) is called

  function createResolvedModelChunk(response, json) {
    const chunk = new ReactPromise('resolved_model', json, response)
    return chunk
  }

  // Correctness check
  const testResponse = makeResponse()
  const testChunk = createResolvedModelChunk(testResponse, payloads[0])
  initializeModelChunk(testChunk)
  const elemCount = countElements(testChunk.value)
  const status = testChunk.status

  // Warmup
  for (let w = 0; w < Math.min(500, iterations); w++) {
    const resp = makeResponse()
    for (const json of payloads) {
      const chunk = createResolvedModelChunk(resp, json)
      initializeModelChunk(chunk)
    }
  }
  if (global.gc) global.gc()

  // Measure
  const times = []
  const batchSize = 100
  const batches = Math.ceil(iterations / batchSize)

  for (let b = 0; b < batches; b++) {
    const start = performance.now()
    for (let i = 0; i < batchSize; i++) {
      const resp = makeResponse()
      for (const json of payloads) {
        const chunk = createResolvedModelChunk(resp, json)
        initializeModelChunk(chunk)
      }
    }
    times.push((performance.now() - start) / batchSize)
  }

  times.sort((a, b) => a - b)
  return {
    label,
    status,
    elemCount,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    min: times[0],
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('React Server DOM — reviver vs walk benchmark')
  console.log(`Node.js ${process.version}`)
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(
    `GC exposed: ${typeof global.gc === 'function' ? 'yes' : 'no (use --expose-gc)'}`
  )

  console.log('\nLoading modules...')
  const origInternals = extractCoreFunctions(path.resolve(BACKUP_FILE))
  const walkInternals = extractCoreFunctions(path.resolve(MODIFIED_FILE))
  console.log('  Original (reviver): loaded')
  console.log('  Modified (walk): loaded')

  const suites = [
    { name: 'Small (2 elements)', payloads: [makeSmallPayload()], iters: 50000 },
    { name: 'Medium (~12 elements)', payloads: [makeMediumPayload()], iters: 20000 },
    { name: 'Large (~90 elements)', payloads: [makeLargePayload()], iters: 5000 },
    { name: 'XL (~200 elements)', payloads: [makeXLPayload()], iters: 2000 },
  ]

  for (const suite of suites) {
    console.log(`\n${'═'.repeat(82)}`)
    const totalBytes = suite.payloads.reduce((a, p) => a + p.length, 0)
    console.log(
      `  ${suite.name} (${totalBytes.toLocaleString()} bytes JSON, ${suite.iters.toLocaleString()} iterations)`
    )
    console.log(`${'═'.repeat(82)}`)

    const origResult = directBenchmark(
      'Original (reviver)',
      origInternals,
      suite.payloads,
      suite.iters
    )
    const walkResult = directBenchmark(
      'Modified (walk)',
      walkInternals,
      suite.payloads,
      suite.iters
    )

    console.log(
      `  Correctness:  orig=${origResult.elemCount} elems (${origResult.status})  walk=${walkResult.elemCount} elems (${walkResult.status})  ${origResult.elemCount === walkResult.elemCount && origResult.status === walkResult.status ? '✓' : '✗ MISMATCH'}`
    )

    console.log(
      `\n  ${'Variant'.padEnd(22)} ${'Avg (ms)'.padStart(10)} ${'P50 (ms)'.padStart(10)} ${'P95 (ms)'.padStart(10)} ${'Min (ms)'.padStart(10)} ${'vs Orig'.padStart(10)}`
    )
    console.log(`  ${'-'.repeat(72)}`)
    for (const r of [origResult, walkResult]) {
      const speedup = ((origResult.avg - r.avg) / origResult.avg) * 100
      const sp =
        r === origResult
          ? '       -'
          : `${speedup > 0 ? '+' : ''}${speedup.toFixed(1)}%`
      console.log(
        `  ${r.label.padEnd(22)} ${r.avg.toFixed(4).padStart(10)} ${r.p50.toFixed(4).padStart(10)} ${r.p95.toFixed(4).padStart(10)} ${r.min.toFixed(4).padStart(10)} ${sp.padStart(10)}`
      )
    }
  }

  console.log(`\n${'═'.repeat(82)}`)
  console.log('  Done.')
  console.log(`${'═'.repeat(82)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
