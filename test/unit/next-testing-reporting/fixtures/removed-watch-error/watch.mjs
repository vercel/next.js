import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [fixture, testing] = process.argv.slice(2)
const { watchTests } = await import(
  pathToFileURL(join(testing, 'watch-orchestrator.js')).href
)
const { parseResultReporters } = await import(
  pathToFileURL(join(testing, 'reporting/machine.js')).href
)
const controller = new AbortController()
const watching = watchTests(fixture, {
  signal: controller.signal,
  resultReporters: parseResultReporters(['./reporter.mjs']),
  onEvent(event) {
    if (event.type === 'diagnostic') process.send({ type: 'diagnostic', event })
  },
  write: (text) => process.stdout.write(text),
  writeError(text) {
    process.send({ type: 'write-error', text })
    if (
      process.env.WATCH_ERROR_WRITER === '1' &&
      text.includes('actual async removed rejection')
    )
      throw new Error('Owned watch error writer failed.')
    process.stderr.write(text)
  },
})
process.on('message', (message) => {
  if (message?.type !== 'close')
    throw new Error('Invalid owned watch close request.')
  controller.abort(new Error('Owned removal regression watch closed.'))
})
try {
  const result = await watching
  process.send({ type: 'result', result })
  process.exitCode = result.status === 'failed' ? 1 : 0
} catch (error) {
  process.send({ type: 'thrown', message: error.message })
  process.exitCode = 1
} finally {
  if (process.connected) process.disconnect()
}
