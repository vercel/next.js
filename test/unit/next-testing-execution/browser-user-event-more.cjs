const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const client = require('next/dist/experimental/testing/client/async-context')
const {
  page,
  userEvent,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM('<!DOCTYPE html><button>More</button>')
  const restoreBrowserDomRealm = require('./browser-dom-realm.cjs')(dom.window)
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
      context: { id: 'user-event-more', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = []
  const originalError = new Error('native action failed')
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
    const button = document.querySelector('button')
    let syntheticEvents = 0
    for (const event of ['click', 'mouseout'])
      button.addEventListener(event, () => syntheticEvents++)
    const tripleClick = userEvent.tripleClick
    const returns = [
      await tripleClick(page.getByRole('button', { name: 'More' }), {
        delay: 1,
        modifiers: ['Shift'],
      }),
      await userEvent.unhover(button, { force: true }),
      await page.elementLocator(button).tripleClick(),
      await page.elementLocator(button).unhover(),
    ]
    assert(returns.every((value) => value === undefined))
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'tripleClick', args: [{ delay: 1, modifiers: ['Shift'] }] },
        { method: 'unhover', args: [{ force: true }] },
        { method: 'tripleClick', args: [] },
        { method: 'unhover', args: [] },
      ]
    )
    assert.equal(new Set(commands.map((command) => command.element)).size, 1)
    assert.equal(syntheticEvents, 0)
    rejectNext = true
    await assert.rejects(
      userEvent.unhover(button),
      (error) => error === originalError
    )
    await assert.rejects(
      userEvent.tripleClick(document.createElement('button')),
      /not attached/
    )
    binding.dispose()
    await assert.rejects(userEvent.unhover(button), /transport has closed/)
    scope.close()
    assert.throws(() => userEvent.tripleClick(button), /scope/)
    process.stdout.write(
      JSON.stringify({
        commands,
        allUndefined: true,
        noSyntheticEvents: true,
        originalErrorRetained: true,
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
