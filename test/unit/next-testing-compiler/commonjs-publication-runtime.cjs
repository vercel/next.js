const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = readFileSync(
  join(
    __dirname,
    '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime/runtime-utils.ts'
  ),
  'utf8'
)
const javascript = ts.transpile(source, { target: ts.ScriptTarget.ES2022 })
const context = vm.createContext({ URL })
vm.runInContext(javascript, context)
const result = vm.runInContext(
  `(() => {
  let assertions = 0
  const assert = (value, message) => { assertions++; if (!value) throw new Error(message) }
  const original = Object.defineProperty
  const trace = []
  let body = false
  let empty, proxy, getter
  Object.defineProperty = function(target, key, descriptor) {
    trace.push(key)
    if (key === Symbol.toStringTag) {
      assert(!body, 'namespace tag must precede authored body')
      empty = target
    }
    if (key === 'label') { proxy = target; getter = descriptor.get }
    return Reflect.apply(original, this, [target, key, descriptor])
  }
  const module = { exports: {} }
  const finish = new Context(module, module.exports).p(true)
  assert(module.namespaceObject === undefined, 'preparation must not publish')
  body = true
  function raw() { return this.label }
  raw.label = 'original'
  original(raw, '__esModule', { value: true, writable: true, configurable: true })
  raw.default = raw
  module.exports = raw
  finish()
  Object.defineProperty = original
  const ns = module.namespaceObject
  assert(module.exports === raw, 'raw exports must stay intact')
  assert(ns === empty && ns !== proxy, 'retained proxy must target actual namespace')
  assert(Object.getPrototypeOf(ns) === null, 'namespace must have null prototype')
  assert(Object.getPrototypeOf(proxy) === Object.prototype, 'proxy must retain CommonJS prototype')
  assert(getter.call({ label: 'foreign' }) === 'original', 'getter must retain raw source')
  assert(ns.default === raw && proxy.default === raw, 'default must retain raw callable')
  assert(trace.length === 2 && trace[0] === Symbol.toStringTag && trace[1] === 'label', 'private marker must not reach authored definitions')
  const marker = Object.getOwnPropertyDescriptor(module, 'commonJsNamespacePublished')
  assert(marker.value === true && !marker.enumerable && marker.configurable, 'private marker shape')
  proxy.added = 'late'
  assert(raw.added === 'late' && ns.added === 'late', 'held proxy mutations must update raw and namespace')
  assert(!Object.getOwnPropertyDescriptor(raw, '__esModule').enumerable, 'hidden flag must stay hidden')
  raw.label = 'changed'
  assert(ns.label === 'changed', 'named getters must stay live')
  const previous = ns
  finish()
  assert(module.namespaceObject === previous, 'finish must retain existing namespace')

  const fresh = { exports: function fresh() {} }
  const freshFinish = new Context(fresh, fresh.exports).p(true)
  freshFinish()
  assert(fresh.namespaceObject !== previous, 'new module generations must have private namespaces')
  assert(previous.default === raw, 'held namespace must retain previous raw generation')
  let definitions = 0
  Object.defineProperty = function() { definitions++; throw new Error('unexpected') }
  assert(new Context(module, raw).p(true) === undefined && definitions === 0, 'existing namespaces must bypass preparation')
  Object.defineProperty = original

  const tagError = new Error('authored tag failure')
  const failed = { exports: {} }
  Object.defineProperty = function(target, key, descriptor) {
    if (key === Symbol.toStringTag) throw tagError
    return Reflect.apply(original, this, [target, key, descriptor])
  }
  let caught
  try { new Context(failed, failed.exports).p(true) } catch (error) { caught = error }
  Object.defineProperty = original
  assert(caught === tagError && failed.namespaceObject === undefined, 'tag errors must remain raw and unpublished')

  const partial = { exports: {} }
  const partialFinish = new Context(partial, partial.exports).p(true)
  function remaining() {}
  remaining.label = 'omitted'
  remaining.other = 'retained'
  partial.exports = remaining
  Object.defineProperty = function(target, key, descriptor) {
    if (key === 'label') throw new Error('authored named failure')
    return Reflect.apply(original, this, [target, key, descriptor])
  }
  partialFinish()
  Object.defineProperty = original
  assert(!('label' in partial.namespaceObject) && partial.namespaceObject.other === 'retained', 'named definition failures must be isolated')

  const thrownBody = { exports: {} }
  new Context(thrownBody, thrownBody.exports).p(true)
  assert(thrownBody.namespaceObject === undefined, 'omitting finish on a thrown body must not publish')
  return { assertions }
})()`,
  context
)
assert.deepEqual(JSON.parse(JSON.stringify(result)), { assertions: 20 })
process.stdout.write(JSON.stringify(result) + '\n')
