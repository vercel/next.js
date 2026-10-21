const assert = require('node:assert/strict')
const Module = require('node:module')
const [directory, encodedStatuses, status] = process.argv.slice(2)
const statuses = JSON.parse(encodedStatuses)
const events = statuses.map((status, index) => ({
  version: 1,
  type: 'run-end',
  runId: `watch-${index}`,
  timestamp: index,
  status,
  durationMs: 0,
}))
const before = JSON.stringify(events)
const result = { status }
const watchFile = require.resolve(
  'next/dist/experimental/testing/watch-orchestrator'
)
const watchModule = new Module(watchFile)
watchModule.filename = watchFile
watchModule.loaded = true
watchModule.exports = {
  async watchTests(_directory, options) {
    for (const event of events) options.onEvent(event)
    return result
  },
}
require.cache[watchFile] = watchModule
require('next/dist/cli/next-test-runner')
  .nextTestRunner(directory, { watch: true, reporter: ['json'] })
  .then(() => {
    assert.equal(JSON.stringify(events), before)
    assert.deepEqual(result, { status })
    console.log(
      JSON.stringify({
        exitCode: process.exitCode,
        statuses,
        result,
        eventsUnchanged: true,
      })
    )
    process.exitCode = 0
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
