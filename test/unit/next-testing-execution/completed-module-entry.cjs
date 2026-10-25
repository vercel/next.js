const fs = require('node:fs')
const paths = require('./runtime-paths.json')
if (paths.mode === 'bootstrap-failure')
  throw new Error('actual bootstrap failure')
const runner = require(paths.runner)
if (paths.protocol) {
  const send = process.send
  process.send = function (message, ...args) {
    if (message.type === 'complete') {
      message = { ...message }
      if (paths.protocol === 'missing') delete message.moduleHostCleanupComplete
      else if (paths.protocol === 'invalid')
        message.moduleHostCleanupComplete = 'true'
      else if (paths.protocol === 'unsolicited')
        message.moduleHostCleanupComplete = true
    }
    return Reflect.apply(send, this, [message, ...args])
  }
}
module.exports.testRunner = {
  ...runner,
  initializeTestFile(options) {
    const file = runner.initializeTestFile(options)
    return new Proxy(file, {
      get(target, key, receiver) {
        if (key === 'dispose' && paths.mode === 'dispose-failure')
          return async () => {
            await target.dispose()
            throw new Error('actual worker owner disposal failure')
          }
        if (key === 'run' && paths.mode === 'reuse-rejected-run')
          return async (runOptions) => {
            await target.run(runOptions)
            return target.run(runOptions)
          }
        if (key === 'getCompletedModuleResult') {
          fs.appendFileSync(paths.trace, 'actual getter\n')
          if (paths.mode === 'missing-fact') return () => undefined
        }
        return Reflect.get(target, key, receiver)
      },
    })
  },
}
module.exports.loadTestModule = async () => {
  const { describe, test, afterAll } = require(paths.vitest)
  if (paths.mode === 'collection-failure')
    throw new Error('actual collection failure')
  if (paths.mode === 'collection-undefined') throw undefined
  if (paths.mode === 'afterAll-failure')
    afterAll(() => {
      throw new Error('actual completed afterAll failure')
    })
  if (paths.mode === 'settled-deadline')
    afterAll(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
  describe('nested', () => {
    const body = () => {
      if (paths.mode === 'settled-deadline')
        return new Promise((resolve) => setTimeout(resolve, 20))
      if (paths.mode === 'hard-deadline' || paths.mode === 'lifetime-abort')
        return new Promise(() => {})
      if (paths.mode === 'failed') throw new Error('actual completed failure')
    }
    if (paths.mode === 'focus') test.only('selected', body)
    else test('selected', body)
    test('unselected', () => {})
  })
}
