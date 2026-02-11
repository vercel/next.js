'use strict'

// Benchmark: JSON.parse reviver vs post-process walk
// Tests the actual production code path through initializeModelChunk.
//
// Run: node --expose-gc bench-rsc-walk.js
//
// This benchmark uses require() (not vm.createContext) so both versions
// run in the same V8 context — matching real-world conditions.

const { performance } = require('perf_hooks')
const fs = require('fs')
const path = require('path')

const BASE = 'packages/next/dist/compiled/react-server-dom-turbopack/cjs'
const MODIFIED_FILE = path.resolve(
  BASE,
  'react-server-dom-turbopack-client.node.production.js'
)

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
  const navItems = ['Product', 'Features', 'Pricing', 'About'].map((name) => [
    '$',
    'a',
    null,
    {
      href: '/' + name.toLowerCase(),
      className: 'text-sm font-semibold leading-6 text-gray-900',
      children: name,
    },
  ])
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
            children:
              i % 3 === 0 ? 'Active' : i % 3 === 1 ? 'Pending' : 'Inactive',
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
                    children: '' + i * 1234,
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

function makeTablePayload(rowCount) {
  const rows = Array.from({ length: rowCount }, (_, i) => [
    '$',
    'tr',
    'row-' + i,
    {
      children: [
        ['$', 'td', null, { children: '' + i }],
        ['$', 'td', null, { children: 'Item ' + i }],
      ],
    },
  ])
  return makeElementRow('table', {
    children: ['$', 'tbody', null, { children: rows }],
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

// ─── Load module via require() for same V8 context ──────────────────────────
// We patch the file to export internals, save as temp file, and require() it.
// This ensures both versions run in the same V8 context — no vm overhead.

function loadWithInternalsExposed(filePath, tempSuffix) {
  const code = fs.readFileSync(filePath, 'utf8')

  const patch = `
;(function() {
  module.exports.__benchmark = {
    ResponseInstance: ResponseInstance,
    initializeModelChunk: initializeModelChunk,
    ReactPromise: ReactPromise,
    getChunk: getChunk,
  };
})();
`
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext)
  const tempPath = path.join(dir, base + tempSuffix + ext)
  fs.writeFileSync(tempPath, code + patch)

  try {
    // Clear cache in case of re-runs
    delete require.cache[require.resolve(tempPath)]
    const mod = require(tempPath)
    return mod.__benchmark
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempPath)
    } catch (e) {}
  }
}

// ─── Direct benchmark ───────────────────────────────────────────────────────

function directBenchmark(label, internals, payloads, iterations) {
  const { ResponseInstance, initializeModelChunk, ReactPromise } = internals

  function makeResponse() {
    return new ResponseInstance(
      null,
      null,
      null,
      undefined,
      undefined,
      undefined,
      undefined
    )
  }

  function createResolvedModelChunk(response, json) {
    return new ReactPromise('resolved_model', json, response)
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

  // Measure in batches
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

function main() {
  console.log('React Server DOM — reviver vs walk benchmark')
  console.log(`Node.js ${process.version}`)
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(
    `GC exposed: ${typeof global.gc === 'function' ? 'yes' : 'no (use --expose-gc)'}`
  )

  const BACKUP_FILE = path.resolve(
    BASE,
    'react-server-dom-turbopack-client.node.production.js.bak'
  )

  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(
      `\nERROR: Backup file not found: ${BACKUP_FILE}\n` +
        `Create it with the original (unmodified) version:\n` +
        `  git show HEAD~2:packages/next/src/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.production.js > ${BACKUP_FILE}`
    )
    process.exit(1)
  }

  console.log('\nLoading modules via require() (same V8 context)...')
  const origInternals = loadWithInternalsExposed(BACKUP_FILE, '.orig-bench')
  const walkInternals = loadWithInternalsExposed(MODIFIED_FILE, '.walk-bench')
  console.log('  Original (reviver): loaded')
  console.log('  Modified (walk): loaded')

  const suites = [
    {
      name: 'Small (2 elements)',
      payloads: [makeSmallPayload()],
      iters: 50000,
    },
    {
      name: 'Medium (~12 elements)',
      payloads: [makeMediumPayload()],
      iters: 20000,
    },
    {
      name: 'Large (~90 elements)',
      payloads: [makeLargePayload()],
      iters: 5000,
    },
    { name: 'XL (~200 elements)', payloads: [makeXLPayload()], iters: 2000 },
    {
      name: 'Table (1000 rows)',
      payloads: [makeTablePayload(1000)],
      iters: 500,
    },
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

main()
