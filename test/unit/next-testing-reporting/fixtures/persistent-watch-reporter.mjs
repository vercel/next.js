import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let root
let previous
let current
let runs = 0
const names = (module) =>
  [...module.children.allTests()].map((test) => test.name)
const emit = (value) =>
  appendFileSync(
    join(root, 'persistent-rows.jsonl'),
    JSON.stringify(value) + '\n'
  )

export default class {
  onInit(context) {
    root = context.config.root
    emit({ type: 'init', watch: context.config.watch, pid: process.pid })
    context.onClose(async () => {
      await Promise.resolve()
      emit({ type: 'close', runs })
      if (
        JSON.parse(readFileSync(join(root, 'persistent-options.json')))
          .closeError
      )
        throw new Error('actual persistent watch close failure')
    })
  }

  async onTestModuleEnd(module) {
    await Promise.resolve()
    current = module
    emit({
      type: 'module',
      names: names(module),
      previousNames: previous ? names(previous) : null,
      state: module.state(),
    })
  }

  async onTestRunEnd(modules, errors, reason) {
    await Promise.resolve()
    emit({
      type: 'end',
      run: ++runs,
      names: modules.map(names),
      sameModule: modules[0] === current,
      errors: errors.map((error) => error.message),
      reason,
    })
    previous = current
  }
}
