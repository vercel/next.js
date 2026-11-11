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
    return new Proxy(this, {
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
