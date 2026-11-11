import { appendFileSync, readFileSync } from 'node:fs'
const emit = (row) => appendFileSync('trace.jsonl', JSON.stringify(row) + '\n')
export default class Reporter {
  constructor() {
    const options = JSON.parse(readFileSync('options.json', 'utf8'))
    if (!options.caseResult) this.onTestCaseResult = undefined
    if (options.collected)
      this.onTestModuleCollected = () => emit({ hook: 'collected' })
  }
  onInit(context) {
    context.onClose(() => emit({ hook: 'close' }))
  }
  onTestCaseResult(test) {
    this.test = test
    emit({ hook: 'case', name: test.name, state: test.result().state })
  }
  onTestModuleEnd(module) {
    this.module = module
    const test = [...module.children.allTests()][0]
    emit({
      hook: 'module',
      state: module.state(),
      sameCase: this.test === test,
      bodyMeta: test.meta().componentBody,
    })
  }
  onUserConsoleLog() {}
  onTestRunEnd(modules, errors, reason) {
    emit({
      hook: 'end',
      reason,
      sameModule: this.module === modules[0],
      errors,
    })
  }
}
