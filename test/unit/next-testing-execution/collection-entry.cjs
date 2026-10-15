const { writeFileSync } = require('node:fs')
const paths = require('./runtime-paths.json')
const runner = require(paths.runner)
exports.testRunner =
  paths.mode === 'cleanup-error'
    ? {
        ...runner,
        initializeTestFile(options) {
          const file = runner.initializeTestFile(options)
          return {
            ...file,
            async dispose() {
              await file.dispose()
              throw new Error('collection cleanup failed')
            },
          }
        },
      }
    : runner
exports.loadTestModule = async () => {
  if (paths.mode.startsWith('execution-fact-'))
    process.send({
      type: 'event',
      event: {
        version: 1,
        runId: 'collection',
        timestamp: Date.now(),
        entryId: 'unit:list',
        revision: 'collection',
        type: paths.mode.slice('execution-fact-'.length),
      },
    })
  const { test, beforeAll, afterAll, vi } = require(paths.vitest)
  const original = () => 1
  const subject = { method: original }
  vi.spyOn(subject, 'method').mockImplementation(() => 2)
  process.once('exit', () => {
    writeFileSync(
      paths.marker,
      subject.method === original ? 'restored' : 'leaked'
    )
  })
  const never = () => {
    throw new Error('collection invoked execution')
  }
  beforeAll(never)
  afterAll(never)
  test('listed', never)
  test.skip('hidden', never)
  test.todo('todo')
  if (paths.mode === 'collection-error')
    throw new Error('collection import failed')
  if (paths.mode === 'nonzero-exit') process.exitCode = 7
}
