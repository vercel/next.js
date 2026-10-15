import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const trace = (value) =>
  appendFileSync('trace.jsonl', JSON.stringify(value) + '\n')
export default class Reporter {
  constructor() {
    this.mode = JSON.parse(readFileSync('reporter-options.json', 'utf8')).mode
    if (this.mode === 'constructor')
      throw new Error('reporter constructor failed')
    if (this.mode === 'unsupported') this.onTestCaseReady = () => {}
  }
  async onInit(context) {
    this.root = context.config.root
    context.onClose(async () => {
      await new Promise((resolve) => setImmediate(resolve))
      trace({ hook: 'close' })
      if (this.mode === 'cleanup') throw new Error('reporter cleanup failed')
    })
    await new Promise((resolve) => setImmediate(resolve))
    writeFileSync('initialized.json', JSON.stringify({ pid: process.pid }))
    trace({ hook: 'init' })
    if (this.mode === 'init') throw new Error('reporter init failed')
    if (this.mode === 'hang') await new Promise(() => {})
    if (this.mode === 'context') this.projects = context.projects
  }
  async onTestRunEnd(modules, errors, reason) {
    await new Promise((resolve) => setImmediate(resolve))
    if (this.mode === 'end') throw new Error('reporter publication failed')
    trace({
      hook: 'end',
      reason,
      errors: errors.map((error) => error.message),
      modules: modules.map((module) => ({
        type: module.type,
        moduleId: module.moduleId.slice(this.root.length),
        state: module.state(),
        ok: module.ok(),
        size: module.children.size,
        tests: [...module.children.allTests()].map((test) => ({
          type: test.type,
          name: test.name,
          fullName: test.fullName,
          result: test.result(),
          sameModule: test.module === module,
          parentName: test.parent.name,
          annotations: test.annotations(),
          meta: test.meta(),
          tags: test.tags,
          mode: test.options.mode,
        })),
      })),
    })
  }
}
