const fs = require('node:fs')
const { createRequire } = require('node:module')
const base = process.env.NEXT_TEST_NATIVE_CLEANUP_BASE
const trace = process.env.NEXT_TEST_NATIVE_CLEANUP_TRACE
if (base && trace) {
  const playwright = createRequire(base)('playwright')
  const prototypes = new WeakSet(),
    contexts = new WeakSet(),
    browsers = new WeakSet()
  function page(value) {
    const prototype = Object.getPrototypeOf(value.locator('body'))
    if (!prototypes.has(prototype)) {
      prototypes.add(prototype)
      const click = prototype.click
      prototype.click = function (...args) {
        const operation = Reflect.apply(click, this, args)
        fs.appendFileSync(
          trace,
          JSON.stringify({
            phase: 'real-native-click-started',
            pid: process.pid,
          }) + '\n'
        )
        return operation
      }
    }
    return value
  }
  function context(value) {
    if (contexts.has(value)) return value
    contexts.add(value)
    const original = value.newPage
    value.newPage = async function (...args) {
      return page(await Reflect.apply(original, this, args))
    }
    return value
  }
  function browser(value) {
    if (browsers.has(value)) return value
    browsers.add(value)
    const original = value.newContext
    value.newContext = async function (...args) {
      return context(await Reflect.apply(original, this, args))
    }
    return value
  }
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const type = playwright[name],
      launch = type.launch,
      connect = type.connect,
      persistent = type.launchPersistentContext
    type.launch = async function (...args) {
      return browser(await Reflect.apply(launch, this, args))
    }
    type.connect = async function (...args) {
      return browser(await Reflect.apply(connect, this, args))
    }
    type.launchPersistentContext = async function (...args) {
      return context(await Reflect.apply(persistent, this, args))
    }
  }
}
