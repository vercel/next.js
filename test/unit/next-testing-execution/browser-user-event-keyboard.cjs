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
    const input = document.querySelector('input')
    const locator =
      require('next/dist/experimental/testing/client/browser-context').page.getByLabelText(
        'Second'
      )
    const returns = [
      await userEvent.type(locator, 'aA', { skipClick: true }),
      await userEvent.keyboard('{ArrowLeft}{Backspace}'),
      await userEvent.type(input, '東京'),
      await userEvent.keyboard('{selectall}'),
    ]
    assert(returns.every((value) => value === undefined))
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'type', args: ['aA', { skipClick: true }] },
        { method: 'keyboard', args: ['{ArrowLeft}{Backspace}'] },
        { method: 'type', args: ['東京'] },
        { method: 'keyboard', args: ['{selectall}'] },
      ]
    )
    assert.equal(syntheticEvents, 0)
    assert.equal(document.activeElement, document.body)
    rejectNext = true
    await assert.rejects(
      userEvent.keyboard('a'),
      (error) => error === originalError
    )
    const body = document.body
    body.remove()
    await assert.rejects(userEvent.keyboard('a'), /not attached/)
    document.documentElement.append(body)
    binding.dispose()
    await assert.rejects(userEvent.keyboard('a'), /transport has closed/)
    scope.close()
    await assert.rejects(userEvent.keyboard('a'), /scope/)
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
