const assert = require('node:assert/strict')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const mode = process.argv[2]
const c = createCollector('filtered-role')
let bodies = 0,
  prepares = 0,
  actual
c.api.test('ordinary', () => bodies++)
const role =
  mode === 'true'
    ? true
    : mode === 'false'
      ? false
      : mode === 'one'
        ? 1
        : undefined
runCollected(
  c.close(),
  {
    runId: 'filtered-role',
    signal: new AbortController().signal,
    testNamePattern: 'never',
    finalizePublicTaskModes: true,
    ...(mode === 'omitted' ? {} : { finalizeFocusedPublicTaskModes: role }),
    onCollected(file) {
      actual = { mode: file.mode, childMode: file.tasks[0].mode }
    },
    prepareSnapshots(file) {
      if (file.mode !== 'skip') prepares++
    },
  },
  () => {}
)
  .then((result) => {
    assert.equal(actual.mode, mode === 'true' ? 'skip' : 'run')
    assert.equal(actual.childMode, mode === 'true' ? 'skip' : 'run')
    assert.equal(prepares, mode === 'true' ? 0 : 1)
    assert.equal(bodies, 0)
    assert.equal(result.errors.length, 0)
    assert.equal(result.cases[0].status, 'skipped')
    assert.equal(result.cases[0].unexecuted, undefined)
    process.stdout.write(
      JSON.stringify({ mode, actualSelectionOwner: mode === 'true' }) + '\n'
    )
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
