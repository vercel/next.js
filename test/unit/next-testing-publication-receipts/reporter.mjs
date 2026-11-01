import { appendFileSync } from 'node:fs'
const trace = process.env.NEXT_TESTING_PUBLICATION_RECEIPTS_TRACE
const record = (value) => appendFileSync(trace, JSON.stringify(value) + '\n')
const error = (value) =>
  value === null || typeof value !== 'object'
    ? { value, kind: typeof value }
    : {
        name: value.name,
        message: value.message,
        stack: value.stack,
        type: value.type,
      }
export default class {
  onUserConsoleLog(log) {
    for (const line of log.content.split('\n'))
      if (line.startsWith('RETRY_PUBLICATION_ROW '))
        appendFileSync(trace, line.slice(22) + '\n')
  }
  onTestModuleCollected(module) {
    record({
      actor: 'reporter',
      phase: 'collected',
      module: module.relativeModuleId,
      cases: [...module.children.allTests()].map((test) => ({
        name: test.name,
        state: test.state(),
      })),
    })
  }
  onTestModuleEnd(module) {
    record({
      actor: 'reporter',
      phase: 'end',
      module: module.relativeModuleId,
      state: module.state(),
      errors: module.errors().map(error),
      cases: [...module.children.allTests()].map((test) => ({
        name: test.name,
        state: test.state(),
      })),
    })
  }
  onTestRunEnd(modules, errors, reason) {
    record({
      actor: 'reporter',
      phase: 'run-end',
      reason,
      modules: modules.map((module) => ({
        module: module.relativeModuleId,
        state: module.state(),
        errors: module.errors().map(error),
      })),
      errors: errors.map(error),
    })
  }
}
