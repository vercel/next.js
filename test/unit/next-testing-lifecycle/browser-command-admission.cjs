const assert = require('node:assert/strict')
const scopes = require('next/dist/experimental/testing/client/async-context')

const failures = []
const context = (index, signal = new AbortController().signal) => ({
  id: `run/entry/${index}/0/0`,
  fileId: 'entry',
  testId: `entry/${index}`,
  name: String(index),
  retry: 0,
  repeat: 0,
  signal,
})
const scope = (index, signal) =>
  scopes.createAsyncScope(
    { kind: 'attempt', context: context(index, signal) },
    (error) => failures.push(error)
  )
const a = scope(0)
const admission = a.run(scopes.captureClientCommandAdmission)
const operation = Promise.resolve('actual command')
const other = Promise.resolve('different command')
assert.deepEqual(admission.origin, {
  fileId: 'entry',
  caseId: 'entry/0',
  attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
})
assert.throws(() => admission.query(operation, () => {}), /Invalid.*operation/)
admission.bind(operation)
assert.throws(() => admission.bind(operation), /already bound/)
assert.throws(() => admission.query(other, () => {}), /Invalid.*operation/)
a.close()
const b = scope(1)
const original = new Error('original query failure')
b.run(() => {
  const exact = {}
  assert.equal(
    admission.query(operation, () => {
      assert.equal(scopes.getConsoleTask().attempt.id, 'run/entry/0/0/0')
      assert.throws(
        () => scopes.assertBrowserApiScope('utility'),
        /closed attempt scope "0"/
      )
      return exact
    }),
    exact
  )
  assert.equal(scopes.getConsoleTask().attempt.id, 'run/entry/1/0/0')
  assert.throws(
    () =>
      admission.query(operation, () => {
        throw original
      }),
    (error) => error === original
  )
  assert.equal(scopes.getConsoleTask().attempt.id, 'run/entry/1/0/0')
})
assert.equal(failures.length, 1)
assert.throws(() => admission.finish(other), /Invalid.*operation/)
admission.finish(operation)
assert.throws(() => admission.finish(operation), /Invalid.*operation/)
assert.throws(() => admission.query(operation, () => {}), /Invalid.*operation/)
assert.throws(
  () => a.run(scopes.captureClientCommandAdmission),
  /closed attempt scope "0"/
)
const controller = new AbortController()
const c = scope(2, controller.signal)
const cancelled = c.run(scopes.captureClientCommandAdmission)
cancelled.bind(operation)
controller.abort(original)
assert.throws(
  () => cancelled.query(operation, () => {}),
  (error) => error === original
)
cancelled.finish(operation)
const hook = scopes.createAsyncScope(
  {
    kind: 'hook',
    context: {
      id: 'hook',
      name: 'hook',
      fileId: 'entry',
      suiteId: 'entry',
      hook: 'afterAll',
      signal: new AbortController().signal,
    },
  },
  (error) => failures.push(error)
)
assert.equal(hook.run(scopes.captureClientCommandAdmission), undefined)
b.close()
c.close()
hook.close()
process.stdout.write(
  JSON.stringify({
    exactPromiseIdentity: true,
    trueClosedOriginRetained: true,
    publicGuardsStillClosed: true,
    callerRestored: true,
    originalErrorAndAbortIdentity: true,
    noNewAdmissionAfterClose: true,
    hooksRemainLegacy: true,
  }) + '\n'
)
