const assert = require('node:assert/strict')
const client = require('next/dist/experimental/testing/client/async-context')
const failures = []
let controls = 0
for (const kind of ['file-fixtures', 'worker-fixtures']) {
  const scope = client.createAsyncScope(
    { kind, context: { id: kind, name: kind } },
    (error) => failures.push(error)
  )
  const continuation = scope.run(() => {
    client.assertBrowserApiScope('browser-native')
    assert.equal(client.captureClientCommandAdmission(), undefined)
    controls++
    for (const api of ['utility', 'declaration', 'assertion']) {
      assert.throws(
        () => client.assertBrowserApiScope(api),
        /originating file, hook or test scope/
      )
      controls++
    }
    return client.captureAsyncScope()
  })
  assert.throws(
    () => client.assertBrowserApiScope('browser-native'),
    /originating file, hook or test scope/
  )
  controls++
  assert.throws(
    () => client.invokeClientAttempt({ id: kind }, () => {}),
    /Invalid Browser Mode attempt ownership/
  )
  controls++
  scope.close()
  assert.throws(
    () => scope.run(() => client.assertBrowserApiScope('browser-native')),
    /Late Browser Mode API access from closed/
  )
  controls++
  assert.throws(
    () => scope.run(() => client.captureClientCommandAdmission()),
    /Late Browser Mode API access from closed/
  )
  controls++
  assert.throws(
    () => continuation.run(() => {}),
    /Late Browser Mode API access from closed/
  )
  controls++
}
assert.equal(controls, 18)
assert.equal(failures.length, 6)
process.stdout.write(
  JSON.stringify({
    controls,
    liveActualFixtureScopesOnly: true,
    noSyntheticAttemptOrigin: true,
    assertionDeclarationAndUtilityAdmissionHeld: true,
    absentForeignAndClosedOwnersRefused: true,
    lateContinuationRefused: true,
  }) + '\n'
)
