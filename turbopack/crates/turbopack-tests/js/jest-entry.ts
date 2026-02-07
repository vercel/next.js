/// <reference path="./types.d.ts" />

const jest = require('jest-circus')
const expectMod = require('expect')

function setupGlobals() {
  globalThis.describe = jest.describe
  globalThis.it = jest.it
  globalThis.test = jest.test
  // @ts-ignore Property 'expect' does not exist on type 'typeof globalThis'
  globalThis.expect = expectMod.expect

  // Set up global external values for testing
  // @ts-ignore Property 'testGlobalExternalValue' does not exist on type 'typeof globalThis'
  globalThis.testGlobalExternalValue = { bar: '11' }

  // From https://github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/test/TestCases.template.js#L422
  globalThis.nsObj = function nsObj(obj) {
    Object.defineProperty(obj, Symbol.toStringTag, {
      value: 'Module',
    })
    return obj
  }
}

const uncaughtExceptions: string[] = []
const unhandledRejections: string[] = []

process.on('uncaughtException', (e) => {
  uncaughtExceptions.push(String(e))
})

process.on('unhandledRejection', (e) => {
  unhandledRejections.push(String(e))
})

export default async function run() {
  setupGlobals()

  await import('TESTS')

  let jestResult = await jest.run()
  // Jest test results can contain references to arbitrary objects.
  // Defensively remove circular references to avoid breaking our serialization protocol.
  const seen = new Set()
  jestResult = JSON.parse(
    JSON.stringify(jestResult, (k, v) => {
      if (v != null && typeof v === 'object') {
        if (!seen.has(v)) {
          seen.add(v)
          return v
        } else {
          return 'CIRCULAR_REFERENCE_REMOVED'
        }
      }
      return v
    })
  )

  // Wait a full tick for unhandledRejection handlers to run -- a microtask is not sufficient.
  await new Promise((resolve) => setTimeout(resolve, 0))

  return {
    jestResult,
    uncaughtExceptions,
    unhandledRejections,
  }
}
