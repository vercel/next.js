const assert = require('node:assert/strict')
const {
  initializeTestFile,
  getConsoleTask,
  getCurrentConsoleTask,
} = require('next/dist/experimental/testing/runner')
async function main() {
  const file = initializeTestFile({
    fileId: 'entry',
    filePath: '/original/console.test.mjs',
    publicTaskSelection: true,
  })
  let suiteChecked = false,
    caseChecked = false
  try {
    await file.collect(() => {
      file.api.beforeAll(() => {
        const task = getCurrentConsoleTask()
        assert.equal(task.type, 'suite')
        assert.equal(task.id, 'entry')
        assert.deepEqual(getConsoleTask(), { taskId: 'entry' })
        suiteChecked = true
      })
      file.api.test('actual console task', (context) => {
        assert.equal(getCurrentConsoleTask(), context.task)
        assert.deepEqual(getConsoleTask(), {
          taskId: 'entry/0',
          caseId: 'entry/0',
          attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
        })
        assert.equal(Object.hasOwn(getConsoleTask(), 'task'), false)
        assert.doesNotThrow(() => JSON.stringify(getConsoleTask()))
        caseChecked = true
      })
    })
    const result = await file.run({
      runId: 'run',
      signal: new AbortController().signal,
    })
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed']
    )
    assert.equal(result.errors.length, 0)
    assert.equal(getCurrentConsoleTask(), undefined)
    assert.equal(getConsoleTask(), undefined)
  } finally {
    await file.dispose()
  }
  assert(suiteChecked && caseChecked)
  process.stdout.write(
    JSON.stringify({
      actualTaskIdentity: true,
      suiteTask: true,
      metadataOnly: true,
      selectionCleared: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
