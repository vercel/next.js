const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { createRequire } = Module

function run(packageRoot, mode, productOverride) {
  assert.ok(['native', 'custom-data'].includes(mode))
  assert.equal(process.sourceMapsEnabled, true)
  const load = createRequire(path.join(packageRoot, 'package.json'))
  const before = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  const source = path.join(__dirname, 'fixtures/node-stack-trace')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'next-node-stacks-'))
  let nativeAddonsLoaded = 0
  const nativeExtension = Module._extensions['.node']
  Module._extensions['.node'] = () => {
    nativeAddonsLoaded++
    throw new Error(
      'This stack preparation control must not load native addons'
    )
  }
  try {
    for (const [input, output] of [
      ['thrower.ts.txt', 'thrower.ts'],
      ['thrower.js.txt', 'thrower.js'],
      ['thrower.js.map.json', 'thrower.js.map'],
    ])
      fs.copyFileSync(path.join(source, input), path.join(directory, output))
    let customCalls = 0
    let customReceiver
    const custom = function (error, frames) {
      customCalls++
      customReceiver = this
      return (
        'AUTHORED:' +
        error.name +
        ': ' +
        error.message +
        frames.map((frame) => '\n    at ' + frame.toString()).join('')
      )
    }
    if (mode === 'custom-data')
      Object.defineProperty(Error, 'prepareStackTrace', {
        value: custom,
        writable: true,
        configurable: true,
        enumerable: false,
      })
    const originalPrepare = Object.getOwnPropertyDescriptor(
      Error,
      'prepareStackTrace'
    )
    // The actual worker imports this before Next's environment bootstrap.
    const { restoreNodeStackTrace } = productOverride
      ? require(productOverride)
      : load('next/dist/experimental/testing/execution/node-stack-trace')
    const compiled = require(path.join(directory, 'thrower.js'))
    const describe = (descriptor) => ({
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: descriptor.writable,
      get: descriptor.get,
      set: descriptor.set,
    })
    function observe() {
      compiled.resetCounts()
      const { original, counts } = compiled.capture()
      const identity = original
      const names = Reflect.ownKeys(original)
      const descriptors = Object.getOwnPropertyDescriptors(original)
      const stack = original.stack
      const cached = original.stack
      assert.equal(original, identity)
      assert.equal(cached, stack)
      assert.deepEqual(Reflect.ownKeys(original), names)
      for (const key of names) {
        assert.deepEqual(
          describe(Object.getOwnPropertyDescriptor(original, key)),
          describe(descriptors[key])
        )
      }
      const json = JSON.stringify({
        failureMessages: [original.stack || original.message],
      })
      assert.equal(JSON.parse(json).failureMessages[0], stack)
      return {
        stack,
        counts: { ...counts },
        frames: stack.split('\n').filter((line) => line.startsWith('    at '))
          .length,
      }
    }
    const control = observe()
    const expectedCustomCalls = customCalls
    const { patchErrorInspectNodeJS } = load(
      'next/dist/server/patch-error-inspect'
    )
    patchErrorInspectNodeJS(Error)
    restoreNodeStackTrace()
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'),
      originalPrepare
    )
    const actual = observe()
    assert.deepEqual(actual.counts, control.counts)
    assert.equal(actual.frames, control.frames)
    if (mode === 'native') {
      assert.match(control.stack, /thrower\.ts:4:\d+/)
      assert.match(actual.stack, /thrower\.ts:4:\d+/)
      assert.equal(customCalls, 0)
    } else {
      assert.equal(Error.prepareStackTrace, custom)
      assert.equal(customCalls, expectedCustomCalls * 2)
      assert.equal(customReceiver, Error)
      assert.match(
        actual.stack,
        /^AUTHORED:ObservedError: authored original error/
      )
    }
    assert.equal(nativeAddonsLoaded, 0)
    return {
      mode,
      sourceMapEnabledBeforeLoad: true,
      originalPrepareDescriptorRestored: true,
      sameActualError: true,
      errorDescriptorsPreserved: true,
      gettersMatchNativeControl: true,
      allFramesRetained: true,
      rawJsonUsesActualStack: true,
      nativeAddonsLoaded,
    }
  } finally {
    Module._extensions['.node'] = nativeExtension
    if (before === undefined) Reflect.deleteProperty(Error, 'prepareStackTrace')
    else Object.defineProperty(Error, 'prepareStackTrace', before)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
module.exports = { run }
if (require.main === module) {
  try {
    console.log(
      JSON.stringify(
        run(path.resolve(process.argv[2]), process.argv[3], process.argv[4])
      )
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
