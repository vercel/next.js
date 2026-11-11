import assert from 'node:assert/strict'
import {
  appendFileSync,
  existsSync,
  readFileSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const directory = process.env.NEXT_SUITE_HOOK_FIXTURE_ROOT
const config = JSON.parse(readFileSync(join(directory, 'config.json'), 'utf8'))
const callbacks = [
  'onTestSuiteReady',
  'onTestSuiteResult',
  'onHookStart',
  'onHookEnd',
  'onTestCaseReady',
  'onTestCaseResult',
]
const emit = (value) =>
  appendFileSync(join(directory, 'trace.jsonl'), JSON.stringify(value) + '\n')
const checkpoint = (name) => writeFileSync(join(directory, name), '')
function waitForFile(name) {
  const filename = join(directory, name)
  if (existsSync(filename)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const observe = () => {
      if (existsSync(filename)) {
        unwatchFile(filename, observe)
        resolve()
      }
    }
    const observer = watchFile(filename, { interval: 10 }, observe)
    observer.once('error', (error) => {
      unwatchFile(filename, observe)
      reject(error)
    })
    observe()
  })
}

export function createReporter(index) {
  return class Reporter {
    constructor() {
      this.index = index
      this.failed = false
      emit({ event: 'constructed', index })
      for (const name of callbacks)
        Object.defineProperty(this, name, {
          get() {
            emit({ event: 'get', index, name })
            if (
              index === 0 &&
              name === 'onHookStart' &&
              !this.failed &&
              config.failure === 'getter'
            ) {
              this.failed = true
              throw new Error('actual hook getter failure')
            }
            if (
              index === 0 &&
              name === 'onHookStart' &&
              !this.failed &&
              config.failure === 'noncallable-zero'
            ) {
              this.failed = true
              return 0
            }
            return function (argument) {
              assert.equal(this.index, index)
              const hook = name === 'onHookStart' || name === 'onHookEnd'
              const entity = hook ? argument.entity : argument
              assert.equal(
                entity,
                entity.type === 'test' ? this.test : this.suite
              )
              if (hook) {
                assert.deepEqual(
                  Object.keys(argument),
                  index === 0
                    ? ['name', 'entity']
                    : ['name', 'entity', 'marker']
                )
                if (index === 0) {
                  argument.marker = name + ':' + argument.name
                  globalThis.__nextSuiteHookBatchArgument = argument
                } else {
                  assert.equal(
                    argument,
                    globalThis.__nextSuiteHookBatchArgument
                  )
                  assert.equal(argument.marker, name + ':' + argument.name)
                }
              }
              emit({
                event: 'callback',
                index,
                name,
                hook: hook ? argument.name : undefined,
                id: entity.id,
                parentId: entity.parent.id,
                state:
                  entity.type === 'test'
                    ? entity.result().state
                    : entity.state(),
                meta: entity.meta(),
                argc: arguments.length,
                receiver: this instanceof Reporter,
              })
              if (
                index === 0 &&
                name === 'onHookStart' &&
                !this.failed &&
                config.failure
              ) {
                this.failed = true
                if (config.failure === 'sync-error')
                  throw new Error('actual hook callback failure')
                // Deliberate raw values exercise reporter failure semantics.
                // eslint-disable-next-line no-throw-literal
                if (config.failure === 'sync-undefined') throw undefined
                // eslint-disable-next-line no-throw-literal
                if (config.failure === 'sync-zero') throw 0
                if (config.failure === 'async-false')
                  return Promise.reject(false)
              }
              if (config.gate && index === 0 && name === 'onTestSuiteReady') {
                checkpoint('ready-enter')
                return waitForFile('release-ready').then(() => {
                  emit({ event: 'ready-released', index })
                  checkpoint('ready-done')
                })
              }
              if (config.gate && index === 0 && name === 'onTestCaseResult')
                checkpoint('case-result-enter')
            }
          },
        })
    }
    onInit(context) {
      context.onClose(() => emit({ event: 'closed', index }))
    }
    onTestModuleCollected(module) {
      this.module = module
      this.suite = module.children.at(0)
      this.test = this.suite.children.at(0)
      assert.equal(this.suite.module, module)
      assert.equal(this.test.module, module)
      assert.equal(this.test.parent, this.suite)
      emit({
        event: 'collected',
        index,
        moduleId: module.id,
        suiteId: this.suite.id,
        testId: this.test.id,
      })
    }
    onTestModuleEnd(module) {
      assert.equal(module, this.module)
      assert.equal(module.children.at(0), this.suite)
      assert.equal(this.suite.children.at(0), this.test)
      emit({ event: 'module-end', index, state: module.state() })
    }
    onTestRunEnd(modules, errors, reason) {
      assert.equal(modules[0], this.module)
      emit({
        event: 'run-end',
        index,
        reason,
        errors: errors.map((error) => ({
          type: error?.type,
          message: error?.message,
          messageType: typeof error?.message,
          name: error?.name,
        })),
      })
    }
  }
}
