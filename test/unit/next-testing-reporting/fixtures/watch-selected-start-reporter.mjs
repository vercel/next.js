import { appendFileSync } from 'node:fs'
const row = (x) => appendFileSync('trace.jsonl', JSON.stringify(x) + '\n')
export default class Reporter {
  onInit(ctx) {
    row({ type: 'init' })
    ctx.onClose(() => row({ type: 'close' }))
  }
  get onTestRunStart() {
    row({ type: 'start-read' })
    const receiver = this
    const fn = function (specs) {
      if (this !== receiver) throw new Error('RunStart lost receiver')
      this.specs = specs
      row({
        type: 'start',
        modules: specs.map((s) => s.moduleId),
        pools: specs.map((s) => s.pool),
      })
    }
    fn.call = () => {
      throw new Error('RunStart authored call')
    }
    fn.apply = () => {
      throw new Error('RunStart authored apply')
    }
    return fn
  }
  onTestModuleEnd(m) {
    row({ type: 'module', id: m.moduleId })
  }
  onTestRunEnd(modules, errors, reason) {
    row({
      type: 'end',
      ids: modules.map((m) => m.moduleId),
      specs: this.specs.map((s) => s.moduleId),
      errors: errors.map((e) => e.message),
      reason,
    })
  }
  onWatcherStart(files, errors) {
    row({
      type: 'ready',
      arity: arguments.length,
      files: files?.map((f) => f.filepath),
      errors,
    })
  }
}
