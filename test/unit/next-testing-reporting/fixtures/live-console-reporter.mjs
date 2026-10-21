import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const record = (value) =>
  appendFileSync('live-trace.jsonl', JSON.stringify(value) + '\n')
export default class Reporter {
  onInit(context) {
    this.mode = JSON.parse(readFileSync('live-options.json', 'utf8')).mode
    writeFileSync('live-initialized.json', JSON.stringify({ pid: process.pid }))
    context.onClose(() => record({ hook: 'close' }))
  }
  async onUserConsoleLog(log) {
    record({ hook: 'console', keys: Object.keys(log), log })
    if (this.mode === 'gate' && log.content === 'first\n') {
      for (;;) {
        try {
          readFileSync('release-console')
          break
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
    }
    await new Promise((resolve) => setImmediate(resolve))
    record({ hook: 'settled', content: log.content })
    if (this.mode === 'reject' && log.content === 'first\n')
      throw new Error('console hook rejected')
  }
  onTestRunEnd(modules, errors, reason) {
    record({
      hook: 'end',
      reason,
      errors: errors.map((error) => error.message),
      tasks: modules.flatMap((module) => [
        module.id,
        ...[...module.children.allTests()].map((test) => test.id),
      ]),
    })
  }
}
