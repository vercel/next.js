import { appendFileSync } from 'node:fs'

const row = (value) =>
  appendFileSync('watch-generation-rows.jsonl', JSON.stringify(value) + '\n')
const snapshot = (module) => ({
  logs: module.logs().map((log) => log.content),
  cases: [...module.children.allTests()].map((test) => ({
    name: test.name,
    state: test.result().state,
    logs: test.logs().map((log) => log.content),
  })),
})
const callbacks = {
  onInit(context) {
    row({ type: 'init', watch: context.config.watch })
    context.onClose(async () => {
      await Promise.resolve()
      row({ type: 'close', first: this.first && snapshot(this.first) })
    })
  },
  onUserConsoleLog(log) {
    row({ type: 'console', content: log.content })
  },
  onTestCaseResult(test) {
    row({ type: 'case', name: test.name, state: test.result().state })
  },
  onTestModuleEnd(module) {
    this.last = module
    row({ type: 'module', value: snapshot(module) })
  },
  onTestRunEnd(modules, errors, reason) {
    this.first ??= modules[0]
    row({
      type: 'end',
      reason,
      errors: errors.map((error) => error.message),
      sameAsFirst: modules[0] === this.first,
      sameAsModuleEnd: modules[0] === this.last,
      first: this.first && snapshot(this.first),
      current: modules[0] && snapshot(modules[0]),
    })
  },
  onWatcherStart() {
    row({ type: 'ready' })
  },
  onWatcherRerun(files, trigger) {
    row({ type: 'rerun', files, trigger })
  },
  onTestRemoved(file) {
    row({ type: 'removed', file })
  },
}

export default class Reporter {}
for (const [name, method] of Object.entries(callbacks))
  Object.defineProperty(Reporter.prototype, name, {
    get() {
      row({ type: 'read', name })
      const receiver = this
      const callback = function (...args) {
        if (this !== receiver)
          throw new Error(`Watch reporter receiver changed: ${name}`)
        return Reflect.apply(method, this, args)
      }
      callback.call = () => {
        throw new Error(`Authored callback.call must not run: ${name}`)
      }
      callback.apply = () => {
        throw new Error(`Authored callback.apply must not run: ${name}`)
      }
      return callback
    },
  })
