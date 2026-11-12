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

const directory = process.env.NEXT_RECORD_BATCH_DRAIN_ROOT
const { boundary } = JSON.parse(
  readFileSync(join(directory, 'config.json'), 'utf8')
)
const emit = (row) =>
  appendFileSync(join(directory, 'trace.jsonl'), JSON.stringify(row) + '\n')
const mark = (name) => writeFileSync(join(directory, name), '')
function waitForFile(name) {
  const filename = join(directory, name)
  if (existsSync(filename)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const observe = () => {
      if (!existsSync(filename)) return
      unwatchFile(filename, observe)
      resolve()
    }
    const watcher = watchFile(filename, { interval: 10 }, observe)
    watcher.once('error', (error) => {
      unwatchFile(filename, observe)
      reject(error)
    })
    observe()
  })
}

export default class Reporter {
  onInit(context) {
    context.onClose(() => emit({ event: 'closed' }))
  }
  onTestModuleCollected(module) {
    this.module = module
    this.suite = module.children.at(0)
    this.tests = new Map(
      this.suite.children.array().map((test) => [test.name, test])
    )
    assert.equal(this.tests.size, 2)
  }
  async gate(entity) {
    emit({
      event: 'batch-enter',
      boundary,
      id: entity.id,
      state: entity.type === 'test' ? entity.result().state : entity.state(),
    })
    mark('batch-enter')
    await waitForFile('release-batch')
    emit({ event: 'batch-released', boundary })
    mark('batch-released')
  }
  onTestSuiteReady(suite) {
    assert.equal(suite, this.suite)
    if (boundary === 'SuiteReady') return this.gate(suite)
  }
  onTestCaseReady(test) {
    assert.equal(test, this.tests.get(test.name))
    if (boundary === 'CaseReady' && test.name === 'annotating body')
      return this.gate(test)
  }
  onTestCaseResult(test) {
    assert.equal(test, this.tests.get(test.name))
    emit({ event: 'case-result', name: test.name, state: test.result().state })
    if (test.name === 'ordinary body') mark('ordinary-result')
  }
  onTestCaseAnnotate(test, annotation) {
    emit({ event: 'annotation-enter', id: test.id, annotation })
    mark('annotation-enter')
    assert.equal(test, this.tests.get('annotating body'))
    assert.equal(annotation.message, 'actual causal annotation')
    assert.equal(annotation.type, 'notice')
    assert.equal(
      existsSync(join(directory, 'batch-released')),
      true,
      'The annotation reporter must follow the pending actual task batch'
    )
    assert.equal(
      existsSync(join(directory, 'ordinary-result')),
      true,
      'An ordinary body and its later result batch can progress independently'
    )
  }
  onTestModuleEnd(module) {
    assert.equal(module, this.module)
    assert.equal(module.state(), 'passed')
    emit({ event: 'module-end' })
  }
  onTestRunEnd(modules, errors, reason) {
    assert.equal(modules[0], this.module)
    assert.deepEqual(errors, [])
    assert.equal(reason, 'passed')
    assert.equal(this.tests.get('annotating body').annotations().length, 1)
    emit({ event: 'run-end', reason })
  }
}
