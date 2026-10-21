import fs from 'node:fs'
const rows = []
const seen = []
export default class Reporter {
  onInit(context) {
    this.root = context.config.root
    context.onClose(() => {
      rows.push({ event: 'close' })
      fs.writeFileSync(this.root + '/rows.json', JSON.stringify(rows, null, 2))
    })
  }
  async onTestModuleEnd(module) {
    seen.push(module)
    rows.push({
      event: 'module-end',
      file: module.relativeModuleId,
      state: module.state(),
    })
    await Promise.resolve()
    if (module.relativeModuleId === 'first.test.mjs')
      throw new Error('module hook rejected')
  }
  onTestRunEnd(modules, errors, reason) {
    rows.push({
      event: 'run-end',
      reason,
      files: modules.map((module) => module.relativeModuleId),
      states: modules.map((module) => module.state()),
      errors: errors.map((error) => ({
        name: error.name,
        message: error.message,
      })),
      sameObjects: seen.map((module) => modules.includes(module)),
    })
    fs.writeFileSync(this.root + '/rows.json', JSON.stringify(rows, null, 2))
  }
}
