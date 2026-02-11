'use strict'

// Benchmark: createFromJSONCallback + parseModelString optimization
// Run with: node --expose-gc bench-rsc-reviver.js

const { performance } = require('perf_hooks')

// ─── Shared constants & minimal infrastructure ───────────────────────────────

const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element')
const REACT_LAZY_TYPE = Symbol.for('react.lazy')

function ReactPromise(status, value, reason) {
  this.status = status
  this.value = value
  this.reason = reason
}
ReactPromise.prototype = Object.create(Promise.prototype)
ReactPromise.prototype.then = function () {}

function readChunk(chunk) {
  return chunk.value
}

function createLazyChunkWrapper(chunk) {
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk }
}

function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id)
  chunk ||
    ((chunk = new ReactPromise('fulfilled', 'resolved_' + id, null)),
    chunks.set(id, chunk))
  return chunk
}

function getOutlinedModel(response, reference, parentObject, key, map) {
  var id = parseInt(reference.split(':')[0], 16)
  var chunk = getChunk(response, id)
  return chunk.value
}

function createModel(response, model) {
  return model
}

function createMockResponse() {
  return {
    _chunks: new Map(),
    _closed: false,
    _closedReason: null,
    _tempRefs: null,
  }
}

// ─── VARIANT A: ORIGINAL (verbatim from production build) ───────────────────

var initializingHandler_A = null

function parseModelString_A(response, parentObject, key, value) {
  if ('$' === value[0]) {
    if ('$' === value)
      return (
        null !== initializingHandler_A &&
          '0' === key &&
          (initializingHandler_A = {
            parent: initializingHandler_A,
            chunk: null,
            value: null,
            reason: null,
            deps: 0,
            errored: !1,
          }),
        REACT_ELEMENT_TYPE
      )
    switch (value[1]) {
      case '$':
        return value.slice(1)
      case 'L':
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (response = getChunk(response, parentObject)),
          createLazyChunkWrapper(response)
        )
      case '@':
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          getChunk(response, parentObject)
        )
      case 'S':
        return Symbol.for(value.slice(2))
      case 'I':
        return Infinity
      case '-':
        return '$-0' === value ? -0 : -Infinity
      case 'N':
        return NaN
      case 'u':
        return
      case 'D':
        return new Date(Date.parse(value.slice(2)))
      case 'n':
        return BigInt(value.slice(2))
      default:
        return (
          (value = value.slice(1)),
          getOutlinedModel(response, value, parentObject, key, createModel)
        )
    }
  }
  return value
}

function createFromJSONCallback_A(response) {
  return function (key, value) {
    if ('__proto__' !== key) {
      if ('string' === typeof value)
        return parseModelString_A(response, this, key, value)
      if ('object' === typeof value && null !== value) {
        if (value[0] === REACT_ELEMENT_TYPE) {
          if (
            ((key = {
              $$typeof: REACT_ELEMENT_TYPE,
              type: value[1],
              key: value[2],
              ref: null,
              props: value[3],
            }),
            null !== initializingHandler_A)
          )
            if (
              ((value = initializingHandler_A),
              (initializingHandler_A = value.parent),
              value.errored)
            )
              (key = new ReactPromise('rejected', null, value.reason)),
                (key = createLazyChunkWrapper(key))
            else if (0 < value.deps) {
              var blockedChunk = new ReactPromise('blocked', null, null)
              value.value = key
              value.chunk = blockedChunk
              key = createLazyChunkWrapper(blockedChunk)
            }
        } else key = value
        return key
      }
      return value
    }
  }
}

// ─── VARIANT B: charCodeAt + early returns + flat structure ─────────────────

var initializingHandler_B = null

function parseModelString_B(response, parentObject, key, value) {
  if (36 !== value.charCodeAt(0)) return value
  if (1 === value.length)
    return (
      null !== initializingHandler_B &&
        '0' === key &&
        (initializingHandler_B = {
          parent: initializingHandler_B,
          chunk: null,
          value: null,
          reason: null,
          deps: 0,
          errored: !1,
        }),
      REACT_ELEMENT_TYPE
    )
  switch (value.charCodeAt(1)) {
    case 36:
      return value.slice(1)
    case 76:
      return (
        (parentObject = parseInt(value.slice(2), 16)),
        (response = getChunk(response, parentObject)),
        createLazyChunkWrapper(response)
      )
    case 64:
      return (
        (parentObject = parseInt(value.slice(2), 16)),
        getChunk(response, parentObject)
      )
    case 83:
      return Symbol.for(value.slice(2))
    case 73:
      return Infinity
    case 45:
      return '$-0' === value ? -0 : -Infinity
    case 78:
      return NaN
    case 117:
      return
    case 68:
      return new Date(Date.parse(value.slice(2)))
    case 110:
      return BigInt(value.slice(2))
    default:
      return (
        (value = value.slice(1)),
        getOutlinedModel(response, value, parentObject, key, createModel)
      )
  }
}

function createFromJSONCallback_B(response) {
  return function (key, value) {
    if ('__proto__' === key) return
    if ('string' === typeof value)
      return parseModelString_B(response, this, key, value)
    if ('object' !== typeof value || null === value) return value
    if (value[0] !== REACT_ELEMENT_TYPE) return value

    if (null !== initializingHandler_B) {
      var handler = initializingHandler_B
      initializingHandler_B = handler.parent
      if (handler.errored)
        return createLazyChunkWrapper(
          new ReactPromise('rejected', null, handler.reason)
        )
      if (0 < handler.deps) {
        var blockedChunk = new ReactPromise('blocked', null, null)
        var element = {
          $$typeof: REACT_ELEMENT_TYPE,
          type: value[1],
          key: value[2],
          ref: null,
          props: value[3],
        }
        handler.value = element
        handler.chunk = blockedChunk
        return createLazyChunkWrapper(blockedChunk)
      }
    }
    return {
      $$typeof: REACT_ELEMENT_TYPE,
      type: value[1],
      key: value[2],
      ref: null,
      props: value[3],
    }
  }
}

// ─── VARIANT C: Fully inlined (no separate parseModelString call) ───────────

var initializingHandler_C = null

function createFromJSONCallback_C(response) {
  return function (key, value) {
    if ('__proto__' === key) return

    if ('string' === typeof value) {
      if (36 !== value.charCodeAt(0)) return value
      if (1 === value.length)
        return (
          null !== initializingHandler_C &&
            '0' === key &&
            (initializingHandler_C = {
              parent: initializingHandler_C,
              chunk: null,
              value: null,
              reason: null,
              deps: 0,
              errored: !1,
            }),
          REACT_ELEMENT_TYPE
        )
      switch (value.charCodeAt(1)) {
        case 36:
          return value.slice(1)
        case 76:
          return (
            (key = parseInt(value.slice(2), 16)),
            (response = getChunk(response, key)),
            createLazyChunkWrapper(response)
          )
        case 64:
          return (
            (key = parseInt(value.slice(2), 16)),
            getChunk(response, key)
          )
        case 83:
          return Symbol.for(value.slice(2))
        case 73:
          return Infinity
        case 45:
          return '$-0' === value ? -0 : -Infinity
        case 78:
          return NaN
        case 117:
          return
        case 68:
          return new Date(Date.parse(value.slice(2)))
        case 110:
          return BigInt(value.slice(2))
        default:
          return (
            (value = value.slice(1)),
            getOutlinedModel(response, value, this, key, createModel)
          )
      }
    }

    if ('object' !== typeof value || null === value) return value
    if (value[0] !== REACT_ELEMENT_TYPE) return value

    if (null !== initializingHandler_C) {
      var handler = initializingHandler_C
      initializingHandler_C = handler.parent
      if (handler.errored)
        return createLazyChunkWrapper(
          new ReactPromise('rejected', null, handler.reason)
        )
      if (0 < handler.deps) {
        var blockedChunk = new ReactPromise('blocked', null, null)
        var element = {
          $$typeof: REACT_ELEMENT_TYPE,
          type: value[1],
          key: value[2],
          ref: null,
          props: value[3],
        }
        handler.value = element
        handler.chunk = blockedChunk
        return createLazyChunkWrapper(blockedChunk)
      }
    }
    return {
      $$typeof: REACT_ELEMENT_TYPE,
      type: value[1],
      key: value[2],
      ref: null,
      props: value[3],
    }
  }
}

// ─── VARIANT E: No-reviver post-processing walk ─────────────────────────────
// Measures the theoretical ceiling: parse JSON natively, then walk the tree
// to transform "$" markers into elements. This avoids the C++→JS callback
// overhead of JSON.parse's reviver.

var initializingHandler_E = null

function postProcessWalk(response, obj) {
  if (typeof obj === 'string') {
    // Same parseModelString logic but no reviver overhead
    if (36 !== obj.charCodeAt(0)) return obj
    if (1 === obj.length) return REACT_ELEMENT_TYPE
    switch (obj.charCodeAt(1)) {
      case 36:
        return obj.slice(1)
      case 76:
        return createLazyChunkWrapper(
          getChunk(response, parseInt(obj.slice(2), 16))
        )
      case 64:
        return getChunk(response, parseInt(obj.slice(2), 16))
      case 83:
        return Symbol.for(obj.slice(2))
      case 73:
        return Infinity
      case 45:
        return '$-0' === obj ? -0 : -Infinity
      case 78:
        return NaN
      case 117:
        return undefined
      case 68:
        return new Date(Date.parse(obj.slice(2)))
      case 110:
        return BigInt(obj.slice(2))
      default:
        return getOutlinedModel(
          response,
          obj.slice(1),
          null,
          '',
          createModel
        )
    }
  }
  if (typeof obj !== 'object' || obj === null) return obj

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      obj[i] = postProcessWalk(response, obj[i])
    }
    // Check if this is an element array [REACT_ELEMENT_TYPE, type, key, props]
    if (obj[0] === REACT_ELEMENT_TYPE) {
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type: obj[1],
        key: obj[2],
        ref: null,
        props: obj[3],
      }
    }
    return obj
  }

  // Plain object — walk values
  var keys = Object.keys(obj)
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j]
    if (k !== '__proto__') {
      obj[k] = postProcessWalk(response, obj[k])
    }
  }
  return obj
}

function parseWithPostProcess(response, json) {
  var raw = JSON.parse(json)
  return postProcessWalk(response, raw)
}

// ─── VARIANT F: No-closure reviver (module-level response variable) ─────────
// Tests if closure overhead matters by using a module-level variable

var currentResponse_F = null
var initializingHandler_F = null

function reviverFn_F(key, value) {
  if ('__proto__' === key) return
  if ('string' === typeof value) {
    if (36 !== value.charCodeAt(0)) return value
    if (1 === value.length)
      return (
        null !== initializingHandler_F &&
          '0' === key &&
          (initializingHandler_F = {
            parent: initializingHandler_F,
            chunk: null,
            value: null,
            reason: null,
            deps: 0,
            errored: !1,
          }),
        REACT_ELEMENT_TYPE
      )
    switch (value.charCodeAt(1)) {
      case 36:
        return value.slice(1)
      case 76:
        return createLazyChunkWrapper(
          getChunk(currentResponse_F, parseInt(value.slice(2), 16))
        )
      case 64:
        return getChunk(currentResponse_F, parseInt(value.slice(2), 16))
      case 83:
        return Symbol.for(value.slice(2))
      case 73:
        return Infinity
      case 45:
        return '$-0' === value ? -0 : -Infinity
      case 78:
        return NaN
      case 117:
        return
      case 68:
        return new Date(Date.parse(value.slice(2)))
      case 110:
        return BigInt(value.slice(2))
      default:
        return (
          (value = value.slice(1)),
          getOutlinedModel(
            currentResponse_F,
            value,
            this,
            key,
            createModel
          )
        )
    }
  }

  if ('object' !== typeof value || null === value) return value
  if (value[0] !== REACT_ELEMENT_TYPE) return value

  if (null !== initializingHandler_F) {
    var handler = initializingHandler_F
    initializingHandler_F = handler.parent
    if (handler.errored)
      return createLazyChunkWrapper(
        new ReactPromise('rejected', null, handler.reason)
      )
    if (0 < handler.deps) {
      var blockedChunk = new ReactPromise('blocked', null, null)
      var element = {
        $$typeof: REACT_ELEMENT_TYPE,
        type: value[1],
        key: value[2],
        ref: null,
        props: value[3],
      }
      handler.value = element
      handler.chunk = blockedChunk
      return createLazyChunkWrapper(blockedChunk)
    }
  }
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: value[1],
    key: value[2],
    ref: null,
    props: value[3],
  }
}

// ─── Payload generators ─────────────────────────────────────────────────────

function generateTree(depth, breadth) {
  if (depth === 0) {
    return [
      '$',
      'span',
      null,
      {
        className: 'text-sm font-medium leading-6 text-gray-900',
        children: 'Hello World',
      },
    ]
  }
  const children = []
  for (let i = 0; i < breadth; i++) {
    children.push(generateTree(depth - 1, breadth))
  }
  return [
    '$',
    'div',
    null,
    {
      className: 'flex items-center justify-between gap-x-6 py-5',
      'data-testid': 'container-' + depth,
      children: children.length === 1 ? children[0] : children,
    },
  ]
}

function generateRealisticPage() {
  return [
    '$',
    'main',
    null,
    {
      className: 'min-h-screen bg-white px-6 py-24 sm:py-32 lg:px-8',
      id: 'main-content',
      children: [
        [
          '$',
          'nav',
          null,
          {
            className: 'flex items-center justify-between p-6 lg:px-8',
            children: [
              [
                '$',
                'a',
                null,
                { href: '/', className: '-m-1.5 p-1.5', children: 'Logo' },
              ],
              [
                '$',
                'div',
                null,
                {
                  className: 'flex gap-x-12',
                  children: [
                    [
                      '$',
                      'a',
                      null,
                      {
                        href: '/product',
                        className:
                          'text-sm font-semibold leading-6 text-gray-900',
                        children: 'Product',
                      },
                    ],
                    [
                      '$',
                      'a',
                      null,
                      {
                        href: '/features',
                        className:
                          'text-sm font-semibold leading-6 text-gray-900',
                        children: 'Features',
                      },
                    ],
                    [
                      '$',
                      'a',
                      null,
                      {
                        href: '/pricing',
                        className:
                          'text-sm font-semibold leading-6 text-gray-900',
                        children: 'Pricing',
                      },
                    ],
                  ],
                },
              ],
            ],
          },
        ],
        [
          '$',
          'div',
          null,
          {
            className: 'mx-auto max-w-2xl text-center',
            children: [
              [
                '$',
                'h1',
                null,
                {
                  className:
                    'text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl',
                  children: 'Deploy to the cloud with confidence',
                },
              ],
              [
                '$',
                'p',
                null,
                {
                  className: 'mt-6 text-lg leading-8 text-gray-600',
                  children:
                    'Anim aute id magna aliqua ad ad non deserunt sunt. Qui irure qui lorem cupidatat commodo.',
                },
              ],
            ],
          },
        ],
        ...Array.from({ length: 30 }, (_, i) => [
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
                  className: 'min-w-0',
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
                          ' with additional detail text',
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
                  children: 'Active',
                },
              ],
            ],
          },
        ]),
      ],
    },
  ]
}

const smallPayload = JSON.stringify(generateTree(2, 2))
const mediumPayload = JSON.stringify(generateTree(3, 3))
const largePayload = JSON.stringify(generateTree(4, 3))
const realisticPayload = JSON.stringify(generateRealisticPage())
const xlPayload = JSON.stringify(generateTree(5, 3))

// ─── Benchmark harness ──────────────────────────────────────────────────────

function benchmark(name, fn, iterations) {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 2000); i++) fn()
  if (global.gc) global.gc()

  const times = []
  const batchSize = 200
  const batches = Math.ceil(iterations / batchSize)

  for (let b = 0; b < batches; b++) {
    const start = performance.now()
    for (let i = 0; i < batchSize; i++) fn()
    times.push((performance.now() - start) / batchSize)
  }

  times.sort((a, b) => a - b)
  const p50 = times[Math.floor(times.length * 0.5)]
  const p95 = times[Math.floor(times.length * 0.95)]
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = times[0]

  return { name, avg, p50, p95, min }
}

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

function runSuite(payloadName, payload, iterations) {
  console.log(`\n${'═'.repeat(80)}`)
  console.log(
    `  ${payloadName} (${payload.length} bytes, ${iterations.toLocaleString()} iters)`
  )
  console.log(`${'═'.repeat(80)}`)

  const defs = [
    {
      name: 'A: Original (prod)',
      fn: () => {
        initializingHandler_A = null
        return JSON.parse(payload, createFromJSONCallback_A(createMockResponse()))
      },
    },
    {
      name: 'B: charCodeAt+earlyRet',
      fn: () => {
        initializingHandler_B = null
        return JSON.parse(payload, createFromJSONCallback_B(createMockResponse()))
      },
    },
    {
      name: 'C: Fully inlined',
      fn: () => {
        initializingHandler_C = null
        return JSON.parse(payload, createFromJSONCallback_C(createMockResponse()))
      },
    },
    {
      name: 'E: No-reviver walk',
      fn: () => {
        initializingHandler_E = null
        return parseWithPostProcess(createMockResponse(), payload)
      },
    },
    {
      name: 'F: No-closure reviver',
      fn: () => {
        initializingHandler_F = null
        currentResponse_F = createMockResponse()
        return JSON.parse(payload, reviverFn_F)
      },
    },
    {
      name: '(baseline) JSON.parse only',
      fn: () => JSON.parse(payload),
    },
  ]

  // Correctness check for variants that produce elements
  const elementProducing = defs.slice(0, 5)
  const counts = elementProducing.map((d) => countElements(d.fn()))
  const allMatch = counts.every((c) => c === counts[0])
  console.log(
    `  Correctness: ${counts[0]} elements, all match: ${allMatch ? '✓' : '✗ ' + counts.join(',')}`
  )
  if (!allMatch) return

  const results = defs.map((d) => benchmark(d.name, d.fn, iterations))

  console.log(
    `\n  ${'Variant'.padEnd(28)} ${'Avg (ms)'.padStart(10)} ${'P50 (ms)'.padStart(10)} ${'P95 (ms)'.padStart(10)} ${'Min (ms)'.padStart(10)} ${'vs Orig'.padStart(9)}`
  )
  console.log(`  ${'-'.repeat(77)}`)
  for (const r of results) {
    const speedup = ((results[0].avg - r.avg) / results[0].avg) * 100
    const speedupStr =
      r === results[0]
        ? '     -'
        : `${speedup > 0 ? '+' : ''}${speedup.toFixed(1)}%`
    console.log(
      `  ${r.name.padEnd(28)} ${r.avg.toFixed(4).padStart(10)} ${r.p50.toFixed(4).padStart(10)} ${r.p95.toFixed(4).padStart(10)} ${r.min.toFixed(4).padStart(10)} ${speedupStr.padStart(9)}`
    )
  }

  // Show reviver overhead vs bare JSON.parse
  const baseline = results[results.length - 1]
  const origOverhead =
    ((results[0].avg - baseline.avg) / baseline.avg) * 100
  console.log(
    `\n  Reviver overhead vs bare JSON.parse: +${origOverhead.toFixed(1)}%`
  )
}

// ─── parseModelString isolated micro ────────────────────────────────────────

function runParseModelStringMicro() {
  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  Microbenchmark: parseModelString in isolation`)
  console.log(`${'═'.repeat(80)}`)

  const response = createMockResponse()
  for (let i = 0; i < 256; i++) getChunk(response, i)
  const parentObj = {}

  const plainStrings = [
    'div', 'span', 'p', 'h1', 'h2', 'a', 'button',
    'text-sm font-medium leading-6 text-gray-900',
    'flex items-center justify-between gap-x-6 py-5',
    'mx-auto max-w-2xl text-center',
    'Hello World',
    'Some longer text content that appears in a paragraph',
    '/api/data', '/getting-started', 'container', 'main-content',
    'inline-flex items-center rounded-md bg-green-50 px-2 py-1',
    'border-b border-gray-200 py-4',
    'text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl',
    'mt-6 text-lg leading-8 text-gray-600',
  ]

  const testValues = []
  for (let i = 0; i < 600; i++) testValues.push(plainStrings[i % plainStrings.length])
  for (let i = 0; i < 150; i++) testValues.push('$')
  for (let i = 0; i < 200; i++) testValues.push('$' + (i % 64).toString(16))
  for (let i = 0; i < 50; i++)
    testValues.push(['$Smy.symbol', '$$escaped', '$@a', '$La'][i % 4])

  // Shuffle
  let seed = 42
  for (let i = testValues.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff
    const j = Math.floor((seed / 0x7fffffff) * (i + 1))
    ;[testValues[i], testValues[j]] = [testValues[j], testValues[i]]
  }

  const iterations = 1000
  const parsers = [
    { name: 'A: Original', fn: parseModelString_A },
    { name: 'B: charCodeAt', fn: parseModelString_B },
  ]

  // Run each 3 times and take best to reduce noise
  const allResults = []
  for (const { name, fn } of parsers) {
    // Warmup
    for (let w = 0; w < 500; w++) {
      for (let i = 0; i < testValues.length; i++) fn(response, parentObj, '0', testValues[i])
    }
    if (global.gc) global.gc()

    const times = []
    for (let b = 0; b < iterations; b++) {
      const start = performance.now()
      for (let i = 0; i < testValues.length; i++) fn(response, parentObj, '0', testValues[i])
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    allResults.push({
      name,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      p50: times[Math.floor(times.length * 0.5)],
      min: times[0],
    })
  }

  console.log(`  ${testValues.length} calls per iteration, ${iterations} iterations\n`)
  console.log(
    `  ${'Variant'.padEnd(20)} ${'Avg (ms)'.padStart(10)} ${'P50 (ms)'.padStart(10)} ${'Min (ms)'.padStart(10)} ${'vs Orig'.padStart(9)}`
  )
  console.log(`  ${'-'.repeat(59)}`)
  for (const r of allResults) {
    const sp = ((allResults[0].avg - r.avg) / allResults[0].avg) * 100
    const spStr = r === allResults[0] ? '     -' : `${sp > 0 ? '+' : ''}${sp.toFixed(1)}%`
    console.log(
      `  ${r.name.padEnd(20)} ${r.avg.toFixed(4).padStart(10)} ${r.p50.toFixed(4).padStart(10)} ${r.min.toFixed(4).padStart(10)} ${spStr.padStart(9)}`
    )
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('React Server DOM — createFromJSONCallback + parseModelString')
console.log(`Node.js ${process.version}`)
console.log(`Date: ${new Date().toISOString()}`)
console.log(
  `GC exposed: ${typeof global.gc === 'function' ? 'yes' : 'no (run with --expose-gc)'}`
)

console.log('\n━━━ SECTION 1: Full JSON.parse pipeline (all variants) ━━━')
runSuite('Small tree (~8 elems)', smallPayload, 20000)
runSuite('Medium tree (~40 elems)', mediumPayload, 10000)
runSuite('Large tree (~120 elems)', largePayload, 5000)
runSuite('Realistic page (~160 elems)', realisticPayload, 5000)
runSuite('XL tree (~360 elems)', xlPayload, 2000)

console.log('\n━━━ SECTION 2: parseModelString microbenchmark ━━━')
runParseModelStringMicro()

console.log(`\n${'═'.repeat(80)}`)
console.log('  Done.')
console.log(`${'═'.repeat(80)}`)
