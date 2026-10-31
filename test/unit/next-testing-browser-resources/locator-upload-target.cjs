'use strict'
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const load = process.argv[3] ? createRequire(process.argv[3]) : require
const provider = createRequire(load.resolve('jest-environment-jsdom'))
const { JSDOM } = provider(provider.resolve('jsdom'))
const scopes = load('next/dist/experimental/testing/client/async-context')
const api = load('next/dist/experimental/testing/client/browser-context')
const { getBrowserActionThen } = load(
  'next/dist/experimental/testing/client/browser-action-identity'
)
const mode = process.argv[2]
assert(
  [
    'path',
    'empty',
    'file',
    'utility',
    'captured',
    'target-error',
    'native-error',
    'unawaited',
    'legacy',
    'closed-scope',
  ].includes(mode)
)
const dom = new JSDOM('<!DOCTYPE html><body></body>')
const saved = new Map()
for (const name of [
  'document',
  'window',
  'Element',
  'Node',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLFormElement',
  'HTMLIFrameElement',
  'ShadowRoot',
  'XPathResult',
  'FileReader',
]) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  })
}
const late = [],
  commands = [],
  trace = [],
  task = { type: 'test', id: 'file/0', onFinished: [] },
  originalError = new Error('original upload producer failure')
const scope = scopes.createAsyncScope(
  {
    kind: 'attempt',
    context: { id: 'upload', fileId: 'file', testId: 'case' },
  },
  (error) => late.push(error)
)
const leave = scopes.enterCreatorScope(
  scope.run(() => scopes.captureCreatorScope())
)
const binding = api.initializeBrowserContext(
  async (value) => {
    commands.push(value)
    if (mode === 'native-error') throw originalError
  },
  {
    getConsoleTask() {
      trace.push('task')
      return task
    },
  },
  mode === 'legacy' ? undefined : { serializedClickTargets: true }
)
const target = api.page.getByLabelText('Upload'),
  descriptor = {
    selector: '#captured-upload',
    locator: "locator('#captured-upload')",
  },
  options = { timeout: 5000 }
Object.defineProperty(target, 'serialize', {
  configurable: true,
  get() {
    trace.push('serialize:get')
    if (mode === 'target-error') throw originalError
    return function () {
      assert.equal(this, target)
      assert.equal(arguments.length, 0)
      trace.push('serialize:call')
      return descriptor
    }
  },
})
const originalRead = FileReader.prototype.readAsDataURL
FileReader.prototype.readAsDataURL = function (...args) {
  trace.push('read')
  return Reflect.apply(originalRead, this, args)
}
async function main() {
  let closedError
  try {
    let files = 'assets/alpha.txt'
    if (mode === 'empty') files = []
    if (mode === 'file' || mode === 'utility' || mode === 'unawaited') {
      const file = new dom.window.File(
        [new Uint8Array([0, 255, 17, 66])],
        'memory.bin',
        { type: 'application/x-next-upload' }
      )
      Object.defineProperties(file, {
        name: {
          get() {
            trace.push('name')
            return 'memory.bin'
          },
        },
        type: {
          get() {
            trace.push('type')
            return 'application/x-next-upload'
          },
        },
      })
      files = mode === 'utility' ? [file] : file
    }
    if (mode === 'target-error') {
      assert.throws(
        () => target.upload(files, options),
        (error) => error === originalError
      )
      assert.deepEqual(trace, ['serialize:get'])
      assert.equal(task.onFinished.length, 0)
    } else {
      if (mode === 'legacy') {
        const input = document.createElement('input')
        input.type = 'file'
        input.setAttribute('aria-label', 'Upload')
        document.body.append(input)
      }
      const action =
        mode === 'utility'
          ? api.userEvent.upload(target, files, options)
          : target.upload(files, options)
      assert.equal(Object.prototype.toString.call(action), '[object Action]')
      assert.equal(getBrowserActionThen(action), action.then)
      assert.deepEqual(commands, [])
      assert.deepEqual(
        trace,
        mode === 'legacy'
          ? ['task']
          : ['serialize:get', 'serialize:call', 'task']
      )
      assert.equal(task.onFinished.length, 1)
      if (mode === 'unawaited') {
        assert.throws(task.onFinished[0], /was not awaited/)
        assert.equal(commands.length, 0)
        assert.equal(trace.includes('read'), false)
      } else {
        if (mode === 'captured') {
          descriptor.selector = '#mutated-captured-upload'
          Object.defineProperty(target, 'serialize', {
            value() {
              throw new Error('must not recapture')
            },
          })
          options.timeout = 1234
        }
        if (mode === 'closed-scope') scope.close()
        if (mode === 'native-error')
          await assert.rejects(action, (error) => error === originalError)
        else if (mode === 'closed-scope')
          await assert.rejects(action, (error) => {
            closedError = error
            return /scope|closed/.test(error.message)
          })
        else {
          const values = await Promise.all([
            action.then((value) => value),
            action.then((value) => value),
          ])
          assert.deepEqual(values, [undefined, undefined])
        }
        assert.equal(commands.length, mode === 'closed-scope' ? 0 : 1)
        if (commands.length) {
          const command = commands[0]
          assert.equal(command.method, 'upload')
          assert.equal(command.args[1], options)
          if (mode === 'legacy') {
            assert.equal('locator' in command, false)
            assert.match(command.element, /^next-test-element-[0-9]+$/)
            assert.equal(trace.includes('serialize:get'), false)
          } else {
            assert.equal(command.locator, descriptor)
            assert.equal('element' in command, false)
          }
          assert.deepEqual(
            command.args[0],
            mode === 'empty'
              ? []
              : mode === 'file' || mode === 'utility'
                ? [
                    {
                      name: 'memory.bin',
                      mimeType: 'application/x-next-upload',
                      base64: 'AP8RQg==',
                    },
                  ]
                : ['assets/alpha.txt']
          )
        }
        if (mode === 'file' || mode === 'utility')
          assert.deepEqual(trace.slice(3), ['read', 'name', 'type'])
        for (const finish of task.onFinished) finish()
      }
    }
    assert.deepEqual(late, mode === 'closed-scope' ? [closedError] : [])
    console.log(
      JSON.stringify({
        mode,
        synchronousOnceOnlyTarget: true,
        lazyPayloadAndActionIdentity: true,
        exactOptionsAndOriginalErrors: true,
        legacyAndClosedScopeRetained: true,
      })
    )
  } finally {
    FileReader.prototype.readAsDataURL = originalRead
    binding.dispose()
    scope.close()
    leave()
    dom.window.close()
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
