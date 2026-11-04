import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const typed = (value) => ({
  type: typeof value,
  ...(value === undefined ? {} : { value }),
})
export default class Reporter {
  onInit(context) {
    this.shared = globalThis[Symbol.for('next.testing.root.reporter.owner')]
    this.shared.trace('init', {
      sameCacheObject: this.shared.cache === require('./shared.cjs'),
      root: context.config.root,
    })
    if (this.shared.scenario !== 'clean')
      this.held = setInterval(() => {}, 1000)
    if (this.shared.scenario === 'authored-zero') process.exitCode = 7
    context.onClose(() => {
      this.shared.trace('close-before', { exitCode: typed(process.exitCode) })
      if (this.shared.scenario === 'authored-zero') process.exitCode = 0
      this.shared.trace('close-after', { exitCode: typed(process.exitCode) })
    })
  }
  get onProcessTimeout() {
    const owner = this
    this.shared.trace('timeout-getter')
    const callback = function () {
      this.shared.trace('timeout-entered', {
        receiver: this === owner,
        argc: arguments.length,
      })
      clearInterval(this.held)
    }
    Object.defineProperties(callback, {
      call: {
        value() {
          throw new Error('Authored call must not dispatch timeout')
        },
      },
      apply: {
        value() {
          throw new Error('Authored apply must not dispatch timeout')
        },
      },
    })
    return callback
  }
}
