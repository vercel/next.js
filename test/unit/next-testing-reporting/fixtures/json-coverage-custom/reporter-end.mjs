import { appendFileSync, existsSync } from 'node:fs'
const record = (value) =>
  appendFileSync('trace.jsonl', JSON.stringify(value) + '\n')
export default class {
  onInit(ctx) {
    ctx.onClose(async () => {
      record({
        event: 'close',
        jsonExists: existsSync('cases.json'),
        coverageExists: existsSync('coverage/coverage-final.json'),
      })
      await Promise.resolve()
    })
  }
  async onTestRunEnd() {
    record({ event: 'end' })
    await Promise.resolve()
    throw new Error('owned custom matrix end error')
  }
}
