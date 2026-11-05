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
class Base {
  constructor() {
    this.token = 42
    this.reads = 0
  }
  get onTestRunEnd() {
    const selected = ++this.reads
    record('modern-getter', { reads: selected })
    const fn = function () {
      record('modern-enter', {
        reads: this.reads,
        selected,
        receiver: this.token,
        sameSelected: this.last === fn,
      })
    }
    this.last = fn
    return fn
  }
}
export default class extends Base {}
