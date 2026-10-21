const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const client = require('next/dist/experimental/testing/client/async-context')
const {
  userEvent,
  initializeBrowserContext,
} = require('next/dist/experimental/testing/client/browser-context')

async function main() {
  const dom = new JSDOM(
    '<!DOCTYPE html><button>First</button><input aria-label="Second">'
  )
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
    { kind: 'attempt', context: { id: 'tab', fileId: 'file', testId: 'case' } },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = []
  const originalError = new Error('native keyboard failed')
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
    document.addEventListener('keydown', () => syntheticEvents++)
    const tab = userEvent.tab
    const returns = [
      await tab(),
      await userEvent.tab({ shift: true }),
      await tab({ shift: false }),
    ]
    assert(returns.every((value) => value === undefined))
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'tab', args: [{}] },
        { method: 'tab', args: [{ shift: true }] },
        { method: 'tab', args: [{ shift: false }] },
      ]
    )
    assert.equal(new Set(commands.map((command) => command.element)).size, 1)
    assert.equal(syntheticEvents, 0)
    assert.equal(document.activeElement, document.body)
    rejectNext = true
    await assert.rejects(tab(), (error) => error === originalError)
    const body = document.body
    body.remove()
    await assert.rejects(tab(), /not attached/)
    document.documentElement.append(body)
    binding.dispose()
    await assert.rejects(tab(), /transport has closed/)
    scope.close()
    await assert.rejects(tab(), /scope/)
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
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
