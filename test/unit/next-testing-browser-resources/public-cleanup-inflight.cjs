const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const provider = createRequire(require.resolve('jest-environment-jsdom'))
const { JSDOM } = require(provider.resolve('jsdom'))
const dom = new JSDOM('<!DOCTYPE html><body></body>')
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
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  })
const scopes = require('next/dist/experimental/testing/client/async-context')
const api = require('next/dist/experimental/testing/client/browser-context')
const late = [],
  trace = []
const collection = scopes.createAsyncScope(
  { kind: 'collection', context: { id: 'file', name: 'file' } },
  (error) => late.push(error)
)
const hook = collection.run(() =>
  scopes.createAsyncScope(
    { kind: 'hook', context: { id: 'hook', suiteId: 'file', name: 'hook' } },
    (error) => late.push(error)
  )
)
const leave = scopes.enterCreatorScope(
  hook.run(() => scopes.captureCreatorScope())
)
let release,
  held = false
const gate = new Promise((resolve) => {
  release = resolve
})
const binding = api.initializeBrowserContext(async (command) => {
  if (command.method === 'keyboard') {
    held = true
    return { unreleased: ['Shift'] }
  }
  assert.equal(command.method, 'keyboardCleanup')
  trace.push('command-start')
  await gate
  held = false
  trace.push('command-end')
})
async function main() {
  try {
    await api.userEvent.keyboard('{Shift>}')
    leave()
    hook.close()
    collection.close()
    const lease = scopes.createDefaultKeyboardCleanupCall(api.userEvent)
    const operation = lease.run(() => api.userEvent.cleanup())
    const result = operation.then(
      () => ({ status: 'fulfilled' }),
      (error) => ({ status: 'rejected', error })
    )
    assert.equal(held, true)
    assert.deepEqual(trace, ['command-start'])
    lease.close()
    release()
    const actual = await result
    assert.equal(actual.status, 'rejected')
    assert.match(
      actual.error.message,
      /Late default Browser keyboard cleanup invocation/
    )
    assert.equal(late.length, 1)
    assert.equal(late[0], actual.error)
    assert.equal(held, false)
    assert.deepEqual(trace, ['command-start', 'command-end'])
    console.log(
      JSON.stringify({
        sameEntryAdmissionValidatedAfterActualJoin: true,
        closedLeaseReportedExactlyOnce: true,
        remainingPhysicalCommandJoined: true,
      })
    )
  } finally {
    binding.dispose()
    dom.window.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
