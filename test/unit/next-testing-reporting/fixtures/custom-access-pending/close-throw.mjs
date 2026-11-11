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
      this.release?.()
      throw new Error('actual accessor close failure120')
    })
  }
  async onTestRunEnd() {
    trace('first-enter')
    await new Promise((resolve) => {
      this.release = resolve
    })
    trace('first-settled')
  }
}
