import fs from 'node:fs'
const rows = []
const seen = []
const diagnostic = (error) => ({ name: error.name, message: error.message })
const testView = (test) => ({
  type: test.type,
  name: test.name,
  fullName: test.fullName,
  state: test.result().state,
  errors: (test.result().errors || []).map(diagnostic),
  parentType: test.parent.type,
  moduleType: test.module.type,
  projectName: test.project.name,
  mode: test.options.mode,
  tags: test.options.tags,
  meta: test.meta(),
  annotations: test.annotations(),
  artifacts: test.artifacts(),
})
const moduleView = (module) => ({
  type: module.type,
  relativeModuleId: module.relativeModuleId,
  projectName: module.project.name,
  state: module.state(),
  ok: module.ok(),
  errors: module.errors().map(diagnostic),
  cases: Array.from(module.children.allTests()).map(testView),
})
export default class Reporter {
  onInit(context) {
    this.root = context.config.root
    rows.push({ event: 'init' })
  }
  async onTestModuleEnd(module) {
    seen.push({ module, tests: Array.from(module.children.allTests()) })
    rows.push({ event: 'module-end', ...moduleView(module) })
    await Promise.resolve()
  }
  onTestRunEnd(modules, errors, reason) {
    rows.push({
      event: 'run-end',
      reason,
      errors: errors.map(diagnostic),
      modules: modules.map(moduleView),
      sameObjects: seen.map(({ module, tests }) => ({
        module: modules.includes(module),
        tests: tests.map((test) =>
          Array.from(module.children.allTests()).includes(test)
        ),
      })),
    })
    fs.writeFileSync(
      this.root + '/module-rows.json',
      JSON.stringify(rows, null, 2)
    )
  }
}
