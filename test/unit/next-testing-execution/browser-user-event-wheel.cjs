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
      context: { id: 'wheel', fileId: 'file', testId: 'case' },
    },
    (error) => {
      throw error
    }
  )
  const leave = client.enterCreatorScope(
    scope.run(() => client.captureCreatorScope())
  )
  const commands = []
  const originalError = new Error('native wheel failed')
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
      await userEvent.wheel(input, { delta: { x: 7, y: 12 }, times: 2 }),
      await userEvent.wheel(locator, { direction: 'left' }),
      await locator.wheel({ direction: 'up', times: 0 }),
    ]
    assert(returns.every((value) => value === undefined))
    assert.deepEqual(
      commands.map(({ method, args }) => ({ method, args })),
      [
        { method: 'wheel', args: [{ delta: { x: 7, y: 12 }, times: 2 }] },
        { method: 'wheel', args: [{ delta: { x: -100, y: 0 }, times: 1 }] },
        { method: 'wheel', args: [{ delta: { x: 0, y: -100 }, times: 0 }] },
      ]
    )
    assert.equal(syntheticEvents, 0)
    await assert.rejects(
      userEvent.wheel(input, { delta: { x: NaN } }),
      /Invalid Browser wheel options/
    )
    rejectNext = true
    await assert.rejects(
      userEvent.wheel(input, { direction: 'down' }),
      (error) => error === originalError
    )
    const body = document.body
    body.remove()
    await assert.rejects(
      userEvent.wheel(input, { direction: 'down' }),
      /not attached/
    )
    document.documentElement.append(body)
    binding.dispose()
    await assert.rejects(
      userEvent.wheel(input, { direction: 'down' }),
      /transport has closed/
    )
    scope.close()
    await assert.rejects(
      async () => userEvent.wheel(input, { direction: 'down' }),
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
