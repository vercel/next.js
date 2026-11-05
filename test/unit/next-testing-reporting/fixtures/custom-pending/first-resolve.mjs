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
