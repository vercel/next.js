import { appendFileSync, readFileSync } from 'node:fs'
const record = (value) =>
  appendFileSync('cancel-trace.jsonl', JSON.stringify(value) + '\n')
export default class Reporter {
  onInit(context) {
    this.mode = JSON.parse(readFileSync('cancel-options.json', 'utf8')).mode
    record({ hook: 'init', pid: process.pid })
    context.onClose(async () => {
      record({ hook: 'close-start' })
      await new Promise((resolve) => setImmediate(resolve))
      if (this.mode.includes('close-error')) {
        record({ hook: 'close-error' })
        throw new Error('actual cancellation close rejected')
      }
      if (this.mode === 'transport-error') {
        await new Promise((resolve, reject) => {
          process.send(
            { type: 'invalid-cancellation-reporter-response' },
            (error) => (error ? reject(error) : resolve())
          )
        })
      }
      record({ hook: 'close-complete' })
    })
  }
  async onUserConsoleLog(log) {
    record({ hook: 'console', content: log.content })
    await new Promise((resolve) => setImmediate(resolve))
    if (this.mode.startsWith('callback-error'))
      throw new Error('actual prior console callback rejected')
  }
  onTestCaseResult() {}
  onTestRunEnd() {
    record({ hook: 'terminal-request' })
    if (this.mode.includes('terminal-error'))
      throw new Error('actual prior terminal callback rejected')
  }
}
