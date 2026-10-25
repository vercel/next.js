const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const client = require('next/dist/experimental/testing/client/async-context')
const {
  page,
  userEvent,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM(
    '<!DOCTYPE html><button>Save</button><input aria-label="Name"><select aria-label="Choice"><option value="one">One</option></select>'
  )
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
  const late = []
  const scope = client.createAsyncScope(
    {
      kind: 'attempt',
      context: { id: 'user-event', fileId: 'file', testId: 'case' },
    },
    (error) => late.push(error.message)
  )
  const token = scope.run(() => client.captureCreatorScope())
  const leave = client.enterCreatorScope(token)
  const commands = []
  const transportError = new Error('native command failed')
  let rejectNext = false
  const binding = initializeBrowserContext(async (command) => {
    if (rejectNext) {
      rejectNext = false
      throw transportError
    }
    commands.push(command)
    return null
  })
  try {
    const button = document.querySelector('button')
    const input = document.querySelector('input')
    const select = document.querySelector('select')
    let synthetic = 0
    button.addEventListener('click', () => synthetic++)
    const returns = []
    const click = userEvent.click
    returns.push(
      await click(page.getByRole('button', { name: 'Save' }), {
        button: 'right',
      })
    )
    returns.push(await userEvent.dblClick(button, { delay: 5 }))
    returns.push(await userEvent.hover(button, { force: true }))
    returns.push(
      await userEvent.fill(
        page.getByRole('textbox', { name: 'Name' }),
        'value',
        { timeout: 20 }
      )
    )
    returns.push(await userEvent.clear(input, { force: true }))
    returns.push(await userEvent.selectOptions(select, 'one', { timeout: 50 }))
    assert(returns.every((value) => value === undefined))
    assert.equal(synthetic, 0)
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'click', args: [{ button: 'right' }] },
        { method: 'dblClick', args: [{ delay: 5 }] },
        { method: 'hover', args: [{ force: true }] },
        { method: 'fill', args: ['value', { timeout: 20 }] },
        { method: 'clear', args: [{ force: true }] },
        { method: 'selectOptions', args: [['one'], { timeout: 50 }] },
      ]
    )
    assert.equal(commands[0].element, commands[1].element)
    assert.equal(commands[0].element, commands[2].element)
    assert.equal(commands[3].element, commands[4].element)
    assert.notEqual(commands[0].element, commands[3].element)
    rejectNext = true
    await assert.rejects(
      userEvent.click(button),
      (error) => error === transportError
    )
    const detached = document.createElement('button')
    await assert.rejects(userEvent.click(detached), /not attached/)
    binding.dispose()
    await assert.rejects(userEvent.click(button), /transport has closed/)
    scope.close()
    assert.throws(() => userEvent.click(button), /scope/)
    await assert.rejects(
      userEvent.click(page.getByRole('button', { name: 'Save' })),
      /scope/
    )
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
