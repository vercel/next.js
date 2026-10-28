// Replays the merged flat/preserved factory from `output/` in a fresh runtime, so the preserved
// member's alias ID is the first to instantiate it. Kept outside `input/` so it is not bundled.
const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

const id = (name) =>
  `[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/exports/mangle-hoisted-alias-first/input/${name}.js [test] (ecmascript)`

module.exports = function replayAliasFirst() {
  const testDir = process.cwd()
  const createRuntime = require(
    path.resolve(
      testDir,
      '../../../../snapshot/runtime/default_build_runtime/output/[turbopack]_runtime.js'
    )
  )
  const output = path.join(testDir, 'output')
  const chunk = fs
    .readdirSync(output)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join(output, file))
    .find((file) => {
      const factories = require(file)
      if (!Array.isArray(factories)) return false
      const index = factories.indexOf(id('flat'))
      return index !== -1 && factories[index + 1] === id('preserved')
    })
  assert(chunk, 'expected flat.js and preserved.js to share a merged factory')

  const flatEvaluations = globalThis.flatAliasEvaluations
  const preservedEvaluations = globalThis.preservedAliasEvaluations
  const runtime = createRuntime('alias-first-test')
  runtime.c(chunk)
  const namespace = runtime.m(id('preserved')).exports
  assert.deepEqual(Object.keys(namespace).sort(), [
    'increment',
    'liveValue',
    'someLongExportName',
  ])
  assert.equal(namespace.someLongExportName, 'preserved')

  const flat = runtime.m(id('flat')).exports
  assert.notEqual(flat, namespace)
  assert(Object.values(flat).includes('flat'))
  assert(Object.values(flat).includes('flat-short'))
  const liveKey = Object.keys(flat).find(
    (key) => flat[key] === 0 && Object.getOwnPropertyDescriptor(flat, key).get
  )
  assert(liveKey, 'expected a live getter in the shared flat table')
  const increment = Object.values(flat).find(
    (value) => typeof value === 'function'
  )
  increment()
  namespace.increment()
  assert.equal(flat[liveKey], 1)
  assert.equal(namespace.liveValue, 1)

  assert.equal(runtime.m(id('preserved')).exports, namespace)
  assert.equal(runtime.m(id('flat')).exports, flat)
  assert.equal(globalThis.flatAliasEvaluations, flatEvaluations + 1)
  assert.equal(globalThis.preservedAliasEvaluations, preservedEvaluations + 1)
}
