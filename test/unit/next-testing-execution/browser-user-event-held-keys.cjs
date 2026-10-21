const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const providerRequire = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(providerRequire.resolve('jsdom'))
const client = require('next/dist/experimental/testing/client/async-context')
const {
  userEvent,
  cleanupBrowserKeyboard,
  cleanupBrowserContext,
  page,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')
const {
  cleanupClientKeyboard,
  runClientKeyboard,
} = require('next/dist/experimental/testing/client/keyboard')

async function main() {
  const dom = new JSDOM('<!DOCTYPE html><input>')
  const saved = new Map(
    ['document', 'Element'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  for (const key of saved.keys())
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'document' ? dom.window.document : dom.window.Element,
    })
  let componentCleaned = false,
    failComponent = false
  const componentError = new Error('component cleanup failed')
  const collection = client.createAsyncScope(
    { kind: 'collection', context: { id: 'file', name: 'file' } },
    (error) => {
      throw error
    }
  )
  collection.run(() =>
    page.extend({
      [Symbol.for('vitest:component-cleanup')]: async () => {
        componentCleaned = true
        if (failComponent) throw componentError
      },
    })
  )
  collection.close()
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'keys', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = [],
    actions = []
  const keyboard = Object.fromEntries(
    ['down', 'up', 'insertText'].map((method) => [
      method,
      async (key) => {
        actions.push([method, key])
      },
    ])
  )
  const cleanupError = new Error('native key cleanup failed')
  let rejectCleanup = false
  const binding = initializeBrowserContext(async (command) => {
    commands.push(command)
    if (command.method === 'keyboardCleanup') {
      if (rejectCleanup) {
        rejectCleanup = false
        throw cleanupError
      }
      await cleanupClientKeyboard(keyboard, command.args[0])
      return null
    }
    const type = command.method === 'type'
    return runClientKeyboard(
      keyboard,
      command.args[0],
      async () => {
        actions.push(['selectAll'])
      },
      command.args[type ? 2 : 1] ?? [],
      type ? (command.args[1]?.skipAutoClose ?? false) : true
    )
  })
  try {
    await userEvent.keyboard('{Shift>}')
    await userEvent.keyboard('a')
    assert.deepEqual(commands.at(-1).args, ['a', ['Shift']])
    rejectCleanup = true
    await assert.rejects(userEvent.cleanup(), (error) => error === cleanupError)
    await userEvent.cleanup()
    const count = commands.length
    await userEvent.cleanup()
    assert.equal(commands.length, count)
    const first = userEvent.setup(),
      second = userEvent.setup()
    await first.keyboard('{Alt>}')
    await second.keyboard('b')
    assert.deepEqual(commands.at(-1).args, ['b'])
    await cleanupBrowserKeyboard()
    assert.equal(commands.length, count + 2)
    await first.cleanup()
    assert.deepEqual(commands.at(-1).args, [['Alt']])
    await userEvent.type(document.querySelector('input'), '{Shift>}c', {
      skipAutoClose: true,
    })
    await userEvent.keyboard('d')
    assert.deepEqual(commands.at(-1).args, ['d', ['Shift']])
    await cleanupBrowserKeyboard()
    await userEvent.keyboard('{ArrowLeft>2/}')
    assert.deepEqual(actions.slice(-3), [
      ['down', 'ArrowLeft'],
      ['down', 'ArrowLeft'],
      ['up', 'ArrowLeft'],
    ])
    const before = actions.length
    await assert.rejects(
      userEvent.keyboard('a{not-a-key>}'),
      /Unsupported keyboard/
    )
    assert.equal(actions.length, before)
    await userEvent.keyboard('z')
    await userEvent.keyboard('{Shift>}')
    rejectCleanup = true
    failComponent = true
    await assert.rejects(
      cleanupBrowserContext(),
      (error) =>
        error instanceof AggregateError &&
        error.errors[0] === cleanupError &&
        error.errors[1] === componentError
    )
    assert.equal(componentCleaned, true)
    failComponent = false
    await userEvent.cleanup()
    binding.dispose()
    await assert.rejects(userEvent.keyboard('a'), /transport has closed/)
    scope.close()
    await assert.rejects(userEvent.cleanup(), /scope/)
    assert.throws(() => userEvent.setup(), /scope/)
    process.stdout.write(
      JSON.stringify({
        independentInstances: true,
        stateRoundTrip: true,
        defaultCleanupOwned: true,
        cleanupFailureRetained: true,
        allCleanupFailuresPreserved: true,
        cleanupIdempotent: true,
        parsedBeforeInput: true,
        rejectionRecoverable: true,
        nativeRepeatedKeys: true,
        closedScopeRefused: true,
      }) + '\n'
    )
  } finally {
    binding.dispose()
    scope.close()
    leave()
    dom.window.close()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
