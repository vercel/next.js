const assert = require('node:assert/strict'),
  scopes = require('next/dist/experimental/testing/client/async-context')
const late = [],
  target = {},
  foreign = {}
const context = {
  id: 'actual-attempt',
  testId: 'test',
  fileId: 'file',
  name: 'actual test',
  retry: 0,
  repeat: 0,
  signal: new AbortController().signal,
}
const owner = scopes.createAsyncScope({ kind: 'attempt', context }, (error) =>
  late.push(error)
)
const cell = owner.run(() => scopes.captureCreatorScope())
let calls = 0
owner.run(() => scopes.invokeClientAttempt(context, () => calls++))
const lease = owner.run(() => scopes.createDefaultKeyboardCleanupCall(target))
lease.run(() => {
  assert.equal(scopes.isDefaultKeyboardCleanupCall(target), true)
  assert.equal(scopes.isDefaultKeyboardCleanupCall(foreign), false)
  scopes.invokeClientAttempt(context, () => calls++)
  const leave = scopes.enterCreatorScope(cell)
  try {
    scopes.invokeClientAttempt(context, () => calls++)
  } finally {
    leave()
  }
})
assert.equal(calls, 3)
owner.close()
lease.run(() => {
  assert.equal(scopes.isDefaultKeyboardCleanupCall(target), true)
  assert.throws(
    () => scopes.invokeClientAttempt(context, () => calls++),
    /Invalid Browser Mode attempt ownership/
  )
  assert.throws(
    () => scopes.assertBrowserApiScope('utility'),
    /Late Browser Mode API access from closed attempt/
  )
})
lease.close()
lease.run(() =>
  assert.throws(
    () => scopes.isDefaultKeyboardCleanupCall(target),
    /Late default Browser keyboard cleanup invocation/
  )
)
assert.equal(calls, 3)
assert.equal(late.length, 2)
console.log(
  JSON.stringify({
    canonicalAttemptIdentityHeld: true,
    liveAndClosedCreatorExact: true,
    closedOwnerNotReactivated: true,
    targetExact: true,
    closedLeaseRefuses: true,
  })
)

const fallback = scopes.createDefaultKeyboardCleanupCall({})
fallback.run(() => {
  assert.equal(scopes.getConsoleTask(), undefined)
  assert.equal(scopes.getOriginatingAttempt(), undefined)
  assert.equal(scopes.getOriginatingHook(), undefined)
})
fallback.close()
