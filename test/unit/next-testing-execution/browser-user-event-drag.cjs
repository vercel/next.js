const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const providerRequire = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(providerRequire.resolve('jsdom'))
const client = require('next/dist/experimental/testing/client/async-context')
const {
  userEvent,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM(
    '<!DOCTYPE html><button>First</button><input aria-label="Second">'
  )
  const restoreBrowserDomRealm = require('./browser-dom-realm.cjs')(dom.window)
  const saved = new Map(
    ['document', 'Element', 'requestAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  for (const key of saved.keys())
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value:
        key === 'requestAnimationFrame'
          ? (callback) => {
              callback(0)
              return 1
            }
          : key === 'document'
            ? dom.window.document
            : dom.window.Element,
    })
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'drag', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = []
  const originalError = new Error('native drag failed')
  let rejectNext = false
  const binding = initializeBrowserContext(async (command) => {
    if (rejectNext) {
      rejectNext = false
      throw originalError
    }
    commands.push(command)
    return null
  })
  try {
    let syntheticEvents = 0
    for (const type of [
      'mousedown',
      'dragstart',
      'dragover',
      'drop',
      'dragend',
    ])
      document.addEventListener(type, () => syntheticEvents++)
    const context = require('next/dist/experimental/testing/client/browser-context')
    const source = document.querySelector('button')
    const target = document.querySelector('input')
    const sourceLocator = context.page.getByRole('button', { name: 'First' })
    const targetLocator = context.page.getByLabelText('Second')
    const options = {
      sourcePosition: { x: 5, y: 5 },
      targetPosition: { x: 30, y: 20 },
      timeout: 20,
    }
    const returns = [
      await userEvent.dragAndDrop(source, targetLocator),
      await sourceLocator.dropTo(targetLocator, options),
      await userEvent.setup().dragAndDrop(sourceLocator, target),
    ]
    assert(returns.every((value) => value === undefined))
    const sourceId = source.getAttribute('data-next-test-element')
    const targetId = target.getAttribute('data-next-test-element')
    assert.notEqual(sourceId, targetId)
    assert.deepEqual(commands, [
      { method: 'dragAndDrop', element: sourceId, args: [targetId] },
      { method: 'dragAndDrop', element: sourceId, args: [targetId, options] },
      { method: 'dragAndDrop', element: sourceId, args: [targetId] },
    ])
    assert.equal(syntheticEvents, 0)
    rejectNext = true
    await assert.rejects(
      userEvent.dragAndDrop(source, target),
      (error) => error === originalError
    )
    await userEvent.dragAndDrop(source, target)
    const beforeDetached = commands.length
    target.remove()
    await assert.rejects(userEvent.dragAndDrop(source, target), /not attached/)
    document.body.append(target)
    source.remove()
    await assert.rejects(sourceLocator.dropTo(targetLocator), /not attached/)
    document.body.prepend(source)
    assert.equal(commands.length, beforeDetached)
    binding.dispose()
    await assert.rejects(
      userEvent.dragAndDrop(source, target),
      /transport has closed/
    )
    scope.close()
    await assert.rejects(
      async () => userEvent.dragAndDrop(source, target),
      /scope/
    )
    process.stdout.write(
      JSON.stringify({
        commands,
        sourceId,
        targetId,
        allUndefined: true,
        noSyntheticEvents: true,
        originalErrorRetained: true,
        rejectedActionRecovered: true,
        detachedTargetsRefused: true,
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
    restoreBrowserDomRealm()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
