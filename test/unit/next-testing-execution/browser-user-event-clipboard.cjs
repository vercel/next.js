const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const providerRequire = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(providerRequire.resolve('jsdom'))
const client = require('next/dist/experimental/testing/client/async-context')
const {
  userEvent,
  initializeBrowserContext,
  cleanupBrowserKeyboard,
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
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'clipboard', fileId: 'file', testId: 'case' },
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
  const originalError = new Error('native clipboard shortcut failed')
  let rejectNext = false,
    syntheticEvents = 0
  for (const type of ['copy', 'cut', 'paste', 'keydown'])
    document.addEventListener(type, () => syntheticEvents++)
  const binding = initializeBrowserContext(async (command) => {
    if (rejectNext) {
      rejectNext = false
      throw originalError
    }
    commands.push(command)
    if (command.method === 'keyboardCleanup') {
      await cleanupClientKeyboard(keyboard, command.args[0])
      return null
    }
    assert.equal(command.method, 'keyboard')
    return runClientKeyboard(
      keyboard,
      command.args[0],
      async () => {},
      command.args[1] ?? [],
      true
    )
  })
  try {
    await userEvent.keyboard('{Alt>}')
    const copied = await userEvent.copy()
    assert.deepEqual(commands.at(-1).args, [
      '{ControlOrMeta>}{c}{/ControlOrMeta}',
      ['Alt'],
    ])
    assert.deepEqual(actions.slice(-4), [
      ['down', 'ControlOrMeta'],
      ['down', 'c'],
      ['up', 'c'],
      ['up', 'ControlOrMeta'],
    ])
    const first = userEvent.setup(),
      second = userEvent.setup()
    await first.keyboard('{Shift>}')
    const cut = await first.cut()
    assert.deepEqual(commands.at(-1).args, [
      '{ControlOrMeta>}{x}{/ControlOrMeta}',
      ['Shift'],
    ])
    const pasted = await second.paste()
    assert.deepEqual(commands.at(-1).args, [
      '{ControlOrMeta>}{v}{/ControlOrMeta}',
    ])
    const extractedCopy = first.copy
    await extractedCopy()
    assert.deepEqual(commands.at(-1).args, [
      '{ControlOrMeta>}{c}{/ControlOrMeta}',
      ['Shift'],
    ])
    await first.cleanup()
    assert.deepEqual(commands.at(-1).args, [['Shift']])
    await cleanupBrowserKeyboard()
    assert.deepEqual(commands.at(-1).args, [['Alt']])
    assert.equal(syntheticEvents, 0)
    assert.deepEqual([copied, cut, pasted], [undefined, undefined, undefined])
    rejectNext = true
    await assert.rejects(second.paste(), (error) => error === originalError)
    await second.copy()
    assert.deepEqual(commands.at(-1).args, [
      '{ControlOrMeta>}{c}{/ControlOrMeta}',
    ])
    binding.dispose()
    for (const actor of [userEvent, first, second])
      for (const name of ['copy', 'cut', 'paste'])
        await assert.rejects(actor[name](), /transport has closed/)
    scope.close()
    for (const name of ['copy', 'cut', 'paste'])
      await assert.rejects(userEvent[name](), /scope/)
    process.stdout.write(
      JSON.stringify({
        independentInstances: true,
        heldStateRetained: true,
        extractedOwnerRetained: true,
        nativeKeyboardUsed: true,
        noSyntheticEvents: true,
        allUndefined: true,
        originalErrorRetained: true,
        rejectionRecoverable: true,
        closedTransportRefused: true,
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
