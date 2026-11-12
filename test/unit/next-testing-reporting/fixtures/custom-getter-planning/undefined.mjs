import fs from 'node:fs'
const record = (name, extra = {}) =>
  fs.appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({
      name,
      jsonExists: fs.existsSync('cases.json'),
      ...extra,
    }) + '\n'
  )
export default class {
  constructor() {
    this.token = 42
    this.reads = 0
  }
  get onTestRunEnd() {
    record('modern-getter', { reads: ++this.reads })
    return undefined
  }
}
