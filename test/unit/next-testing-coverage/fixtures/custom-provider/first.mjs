import { appendFileSync, existsSync, watchFile, unwatchFile } from 'node:fs'
export default class {
  onTestRunEnd() {
    appendFileSync(
      'provider-trace.jsonl',
      JSON.stringify({
        name: 'first-enter',
        jsonExists: existsSync('cases.json'),
      }) + '\n'
    )
    return new Promise((resolve) => {
      const file = process.env.CUSTOM_COVERAGE_RELEASE
      const check = () => {
        if (existsSync(file)) {
          unwatchFile(file, check)
          resolve()
        }
      }
      watchFile(file, { interval: 10 }, check)
      check()
    })
  }
}
