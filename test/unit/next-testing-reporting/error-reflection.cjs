const assert = require('node:assert/strict')
const util = require('node:util')
require('next/dist/server/node-environment-baseline')
const moduleId = require.resolve('next/dist/server/patch-error-inspect')
const originalModule = require.cache[moduleId]
const marker = Symbol.for('next.dev.stackFramesStart')
assert.equal(Object.hasOwn(globalThis, marker), false)
const first = require(moduleId)
assert.equal(Object.hasOwn(globalThis, marker), false)
const distinct = Symbol.for('authored.error')
let reflections = 0
let consumers = 0
function reflect(make, keys, change = () => {}) {
  const error = make()
  const descriptors = Object.getOwnPropertyDescriptors(error)
  const stack = error.stack
  assert.deepEqual(Reflect.ownKeys(error), keys)
  change(error)
  void error.stack
  assert.deepEqual(Reflect.ownKeys(error), keys)
  for (const key of keys.filter(
    (key) => key !== 'stack' && key !== 'message'
  )) {
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(error, key),
      descriptors[key]
    )
  }
  for (const key of [marker, distinct]) {
    if (keys.includes(key)) assert.equal(error[key], 'authored')
  }
  assert.equal(typeof stack, 'string')
  reflections++
}
first.patchErrorInspectNodeJS(Error)
const installedCache = globalThis[marker]
assert.equal(installedCache instanceof WeakMap, true)
reflect(() => new SyntaxError('raw reflection'), ['stack', 'message'])
reflect(() => {
  const error = new Error('authored marker')
  error[marker] = 'authored'
  return error
}, ['stack', 'message', marker])
reflect(() => {
  const error = new Error('distinct symbol')
  error[distinct] = 'authored'
  return error
}, ['stack', 'message', distinct])
reflect(() => Object.freeze(new Error('frozen')), ['stack', 'message'])
reflect(() => Object.seal(new Error('sealed')), ['stack', 'message'])
reflect(
  () => new Error('original'),
  ['stack', 'message'],
  (error) => {
    error.message = 'changed\n    at authored-message'
  }
)
reflect(
  () => new Error('replacement'),
  ['stack', 'message'],
  (error) => {
    error.stack = 'Error: replacement\n    at authored (custom-file.mjs:7:9)'
  }
)
reflect(() => {
  const error = new Error('pre-replaced')
  error.stack = 'literal replacement'
  return error
}, ['stack', 'message'])
reflect(
  () => ({ name: 'Error', message: 'object', stack: 'Error: object' }),
  ['name', 'message', 'stack']
)
reflect(
  () =>
    new AggregateError([new TypeError('inner')], 'aggregate', {
      cause: new Error('cause'),
    }),
  ['stack', 'message', 'cause', 'errors']
)
function inspect(error, install) {
  const stack = error.stack
  install?.()
  const changed = Reflect.set(error, 'message', 'changed')
  const current = require(moduleId)
  const lookups = []
  current.setBundlerFindSourceMapImplementation((file) => {
    lookups.push(file)
    return undefined
  })
  const formatted = util.inspect(error, { colors: false })
  assert.equal(error.stack, stack)
  assert.equal(
    lookups.some((file) => file.includes('authored-message')),
    false
  )
  if (changed) {
    assert.equal(formatted.includes('authored-message'), false)
    assert.match(formatted, /^Error: changed\n/)
  }
  consumers++
}
function freshNode() {
  delete require.cache[moduleId]
  require(moduleId).patchErrorInspectNodeJS(Error)
  assert.equal(globalThis[marker], installedCache)
}
const make = () =>
  new Error('original\n    at pretended (file:///authored-message.mjs:3:4)')
inspect(make())
inspect(make(), freshNode)
inspect(make(), () => {
  // Existing captured stacks survive a third-party formatter replacement.
  Error.prepareStackTrace = () => 'third-party formatter'
})
freshNode()
const replacement = new Error('replacement')
void replacement.stack
replacement.stack =
  'Error: replacement\n    at actualReplacement (file:///replacement.mjs:7:9)'
freshNode()
const lookups = []
require(moduleId).setBundlerFindSourceMapImplementation((file) => {
  lookups.push(file)
  return undefined
})
assert.match(util.inspect(replacement), /actualReplacement/)
assert.equal(
  lookups.some((file) => file.includes('replacement.mjs')),
  true
)
consumers++
first.patchErrorInspectEdgeLite(Error)
assert.equal(globalThis[marker], installedCache)
inspect(make(), freshNode)
inspect(Object.freeze(make()), freshNode)
inspect(Object.seal(make()), freshNode)
first.setBundlerFindSourceMapImplementation(() => undefined)
require.cache[moduleId] = originalModule
console.log(JSON.stringify({ reflections, consumers }))
