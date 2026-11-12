import fs from 'node:fs'
const trace = (name) => {
  fs.appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, jsonExists: fs.existsSync('cases.json') }) + '\n'
  )
}
export default class {
  onTestRunEnd() {
    trace('second-enter')
    throw new Error('actual113 reporter failure')
  }
}
