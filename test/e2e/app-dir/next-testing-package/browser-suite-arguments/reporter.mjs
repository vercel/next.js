import { observeSuites } from './suite-identities.mjs'
import { appendFileSync, writeFileSync } from 'node:fs'
const records = [],
  save = (value) => {
    records.push(value)
    appendFileSync(process.env.CONCURRENCY_TRACE, JSON.stringify(value) + '\n')
  }
const errors = (values) =>
  (values ?? []).map((error) => ({
    name: error.name,
    message: error.message,
    stack: error.stack ?? error.stackStr,
  }))
export default class {
  onTestModuleEnd(module) {
    save({
      hook: 'module',
      id: module.id,
      state: module.state(),
      errors: module.errors(),
    })
  }
  onUserConsoleLog(log) {
    save({ hook: 'console', log })
  }
  onTestCaseResult(test) {
    const value = test.result()
    save({
      hook: 'case',
      id: test.id,
      name: test.name,
      result: { state: value.state, errors: errors(value.errors) },
    })
  }
  onTestRunEnd(modules, unhandled, reason) {
    const files = modules.map((module) => ({
      id: module.id,
      name: module.name,
      state: module.state(),
      suites: observeSuites(module),
      tests: [...module.children.allTests()].map((test) => ({
        id: test.id,
        name: test.name,
        result: {
          state: test.result().state,
          errors: errors(test.result().errors),
        },
      })),
    }))
    save({
      hook: 'end',
      reason,
      errors: errors(unhandled),
      rawUnhandled: unhandled,
      files,
    })
    writeFileSync(
      process.env.CONCURRENCY_TRACE + '.complete.json',
      JSON.stringify(
        {
          reporterVersion: 'suite-identity-v2',
          records,
          reason,
          files,
          errors: errors(unhandled),
        },
        null,
        2
      ) + '\n'
    )
  }
}
