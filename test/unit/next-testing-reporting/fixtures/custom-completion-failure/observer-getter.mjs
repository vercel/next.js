import fs from 'node:fs'
const record = (name) =>
  fs.appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, jsonExists: fs.existsSync('cases.json') }) + '\n'
  )
export default class {
  get onTestRunEnd() {
    record('modern-getter')
    throw new Error('actual113 reporter failure')
  }
}
