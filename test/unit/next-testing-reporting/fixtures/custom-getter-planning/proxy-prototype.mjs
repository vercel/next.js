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
export default class Reporter extends Base {}
Object.setPrototypeOf(
  Reporter.prototype,
  new Proxy(Base.prototype, {
    get(target, key, receiver) {
      if (key === 'onTestRunEnd') record('proxy-get-end')
      return Reflect.get(target, key, receiver)
    },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'onTestRunEnd') record('proxy-descriptor-end')
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
    getPrototypeOf(target) {
      record('proxy-prototype')
      return Reflect.getPrototypeOf(target)
    },
  })
)
