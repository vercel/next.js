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
  related: [join(fixture, 'alpha.mjs')],
  resultReporters: parseResultReporters(['./reporter.mjs']),
  onEvent(event) {
    if (event.type === 'diagnostic') process.send({ type: 'diagnostic', event })
  },
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
})
process.on('message', (message) => {
  if (message?.type !== 'close')
    throw new Error('Invalid owned watch close request.')
  controller.abort(new Error('Owned regression watch closed.'))
})
try {
  await watching
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  if (process.connected) process.disconnect()
}
