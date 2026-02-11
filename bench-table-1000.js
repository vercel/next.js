'use strict'

// Benchmark: 1000-row <Table> RSC payload — reviver vs walk
//
// Simulates the RSC output for:
//   export function Table({ data }: { data: TableEntry[] }) {
//     return (
//       <table>
//         <tbody>
//           {data.map((entry) => (
//             <tr key={entry.id}>
//               <td>{entry.id}</td>
//               <td>{entry.name}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     )
//   }
//
// Run: node --expose-gc bench-table-1000.js

const { performance } = require('perf_hooks')
const vm = require('vm')
const fs = require('fs')
const path = require('path')

const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element')

// ─── Generate the RSC JSON payload ──────────────────────────────────────────
// RSC wire format for a React element: ["$", tagName, key, props]
// "$" is parsed by the reviver/walk into REACT_ELEMENT_TYPE

function generateTablePayload(rowCount) {
  const rows = []
  for (let i = 0; i < rowCount; i++) {
    // <tr key={entry.id}>
    //   <td>{entry.id}</td>
    //   <td>{entry.name}</td>
    // </tr>
    rows.push([
      '$',
      'tr',
      '' + i,
      {
        children: [
          ['$', 'td', null, { children: '' + i }],
          ['$', 'td', null, { children: 'User ' + i }],
        ],
      },
    ])
  }

  // <table><tbody>{rows}</tbody></table>
  return JSON.stringify([
    '$',
    'table',
    null,
    {
      children: ['$', 'tbody', null, { children: rows }],
    },
  ])
}

const payload1000 = generateTablePayload(1000)
const payload100 = generateTablePayload(100)
const payload5000 = generateTablePayload(5000)

// ─── Load both variants from the actual production module ───────────────────

function loadModuleWithExposedInternals(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const util = require('util')
  const mod = { exports: {} }

  const patchedCode =
    code +
    `
;(function() {
  module.exports.__bench = {
    ResponseInstance: ResponseInstance,
    initializeModelChunk: initializeModelChunk,
    ReactPromise: ReactPromise,
  };
})();
`
  const script = new vm.Script(patchedCode, { filename: filePath })
  const ctx = vm.createContext({
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
    ReadableStream:
      typeof ReadableStream !== 'undefined' ? ReadableStream : undefined,
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
  script.runInContext(ctx)
  return mod.exports.__bench
}

// The current file on this branch uses walkParsedJSON.
// Create the original (reviver-based) version by patching the source.
function loadOriginalReviver() {
  const filePath = path.resolve(
    'packages/next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.production.js'
  )
  let code = fs.readFileSync(filePath, 'utf8')

  // Revert initializeModelChunk to use the reviver instead of walkParsedJSON
  code = code.replace(
    'var value = walkParsedJSON(response, JSON.parse(resolvedModel), null, ""),',
    'var value = JSON.parse(resolvedModel, response._fromJSON),'
  )

  // Write to a temp file so vm.Script can load it
  const tmpPath = filePath + '.orig-tmp'
  fs.writeFileSync(tmpPath, code)
  try {
    return { internals: loadModuleWithExposedInternals(tmpPath), tmpPath }
  } catch (e) {
    fs.unlinkSync(tmpPath)
    throw e
  }
}

function loadWalkVariant() {
  const filePath = path.resolve(
    'packages/next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.production.js'
  )
  return { internals: loadModuleWithExposedInternals(filePath) }
}

// ─── Benchmark harness ──────────────────────────────────────────────────────

function countElements(obj) {
  if (!obj || typeof obj !== 'object') return 0
  let count = obj.$$typeof === REACT_ELEMENT_TYPE ? 1 : 0
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && obj[k] !== null)
      count += countElements(obj[k])
  }
  return count
}

function runBench(label, internals, jsonPayload, iterations) {
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

  // Correctness check
  const testResp = makeResponse()
  const testChunk = new ReactPromise('resolved_model', jsonPayload, testResp)
  initializeModelChunk(testChunk)
  const elemCount = countElements(testChunk.value)
  const status = testChunk.status

  // Warmup
  for (let w = 0; w < Math.min(200, iterations); w++) {
    const r = makeResponse()
    const c = new ReactPromise('resolved_model', jsonPayload, r)
    initializeModelChunk(c)
  }
  if (global.gc) global.gc()

  // Measure
  const times = []
  const batchSize = Math.min(100, iterations)
  const batches = Math.ceil(iterations / batchSize)

  for (let b = 0; b < batches; b++) {
    const start = performance.now()
    for (let i = 0; i < batchSize; i++) {
      const r = makeResponse()
      const c = new ReactPromise('resolved_model', jsonPayload, r)
      initializeModelChunk(c)
    }
    times.push((performance.now() - start) / batchSize)
  }

  times.sort((a, b) => a - b)
  return {
    label,
    elemCount,
    status,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    min: times[0],
  }
}

function printResults(suite, results) {
  console.log(`\n${'═'.repeat(84)}`)
  console.log(`  ${suite}`)
  console.log(`${'═'.repeat(84)}`)

  const allCorrect = results.every(
    (r) => r.elemCount === results[0].elemCount && r.status === 'fulfilled'
  )
  console.log(
    `  Elements: ${results[0].elemCount}, status: ${results[0].status}, correct: ${allCorrect ? '✓' : '✗'}`
  )

  console.log(
    `\n  ${'Variant'.padEnd(22)} ${'Avg (ms)'.padStart(10)} ${'P50 (ms)'.padStart(10)} ${'P95 (ms)'.padStart(10)} ${'Min (ms)'.padStart(10)} ${'vs Reviver'.padStart(12)}`
  )
  console.log(`  ${'-'.repeat(74)}`)

  for (const r of results) {
    const speedup = ((results[0].avg - r.avg) / results[0].avg) * 100
    const sp =
      r === results[0]
        ? '         -'
        : `${speedup > 0 ? '+' : ''}${speedup.toFixed(1)}%`
    console.log(
      `  ${r.label.padEnd(22)} ${r.avg.toFixed(4).padStart(10)} ${r.p50.toFixed(4).padStart(10)} ${r.p95.toFixed(4).padStart(10)} ${r.min.toFixed(4).padStart(10)} ${sp.padStart(12)}`
    )
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('<Table> RSC payload benchmark — reviver vs walk')
console.log(`Node.js ${process.version}`)
console.log(
  `GC: ${typeof global.gc === 'function' ? 'yes' : 'no (use --expose-gc)'}`
)
console.log()

console.log('Loading variants...')
const { internals: origInternals, tmpPath } = loadOriginalReviver()
const { internals: walkInternals } = loadWalkVariant()
console.log('  Original (reviver): loaded')
console.log('  Modified (walk):    loaded')

console.log(`\nPayload sizes:`)
console.log(`  100 rows:  ${(payload100.length / 1024).toFixed(1)} KB`)
console.log(`  1000 rows: ${(payload1000.length / 1024).toFixed(1)} KB`)
console.log(`  5000 rows: ${(payload5000.length / 1024).toFixed(1)} KB`)

// --- 100 rows ---
printResults('Table with 100 rows (baseline)', [
  runBench('Original (reviver)', origInternals, payload100, 10000),
  runBench('Walk', walkInternals, payload100, 10000),
])

// --- 1000 rows ---
printResults('Table with 1,000 rows', [
  runBench('Original (reviver)', origInternals, payload1000, 2000),
  runBench('Walk', walkInternals, payload1000, 2000),
])

// --- 5000 rows ---
printResults('Table with 5,000 rows', [
  runBench('Original (reviver)', origInternals, payload5000, 500),
  runBench('Walk', walkInternals, payload5000, 500),
])

// Cleanup temp file
try {
  fs.unlinkSync(tmpPath)
} catch (e) {}

console.log(`\n${'═'.repeat(84)}`)
console.log('  Done.')
console.log(`${'═'.repeat(84)}`)
