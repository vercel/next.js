import fs from 'node:fs'
const trace = (name) => {
  fs.appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, jsonExists: fs.existsSync('cases.json') }) + '\n'
  )
}
export default class {
  onInit(ctx) {
    ctx.onClose(() => {
      trace('first-close')
      this.release?.resolve()
      throw new Error('actual close failure116')
    })
  }
  async onTestRunEnd() {
    trace('first-enter')
    try {
      await new Promise((resolve, reject) => {
        this.release = { resolve, reject }
      })
      trace('first-settled')
    } catch (error) {
      trace('first-rejected')
      throw error
    }
  }
}
