import fs from 'node:fs'
export default class {
  onTestRunEnd() {
    fs.appendFileSync(
      'provider-trace.jsonl',
      JSON.stringify({
        name: 'first-enter',
        jsonExists: fs.existsSync('cases.json'),
      }) + '\n'
    )
    throw new Error('actual113 reporter failure')
  }
}
