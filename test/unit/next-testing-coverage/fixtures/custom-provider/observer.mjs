import { appendFileSync, existsSync } from 'node:fs'
const record = (name, data) =>
  appendFileSync(
    'provider-trace.jsonl',
    JSON.stringify({ name, ...data }) + '\n'
  )
export default class {
  onTestRunEnd(modules, errors, reason) {
    if (process.env.CUSTOM_COVERAGE_FAILURE === '1') {
      record('modern-enter', { jsonExists: existsSync('cases.json') })
      return Promise.resolve().then(() =>
        record('modern-complete', { jsonExists: existsSync('cases.json') })
      )
    }
    record('reporter-modern', {
      reason,
      customReportExists: existsSync('custom-coverage.json'),
      standardJSONExists: existsSync('cases.json'),
    })
  }
}
