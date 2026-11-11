import { appendFileSync, existsSync } from 'node:fs'
export default () => () => {
  appendFileSync(
    'trace.jsonl',
    JSON.stringify({
      event: 'global-teardown',
      jsonExists: existsSync('cases.json'),
      coverageExists: existsSync('coverage/coverage-final.json'),
    }) + '\n'
  )
  throw new Error('owned custom matrix global teardown error')
}
