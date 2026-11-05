import { appendFileSync, existsSync } from 'node:fs'
export default class {
  onTestRunEnd() {
    appendFileSync(
      'provider-trace.jsonl',
      JSON.stringify({
        name: 'second-enter',
        jsonExists: existsSync('cases.json'),
      }) + '\n'
    )
  }
}
