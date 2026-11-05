import fs from 'node:fs'
const record = (name) =>
  fs.appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, jsonExists: fs.existsSync('cases.json') }) + '\n'
  )
export default class {
  onTestRunEnd() {
    record('modern-enter')
    return Promise.reject(new Error('actual113 reporter failure'))
  }
}
