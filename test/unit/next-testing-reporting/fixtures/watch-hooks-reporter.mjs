import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
let root,
  options,
  ready = 0
const emit = (value) =>
  appendFileSync(join(root, 'watch-hooks.jsonl'), JSON.stringify(value) + '\n')
export default class {
  onInit(context) {
    root = context.config.root
    options = JSON.parse(readFileSync(join(root, 'watch-options.json')))
    context.onClose(() => emit({ type: 'close' }))
  }
  async onWatcherStart(files) {
    await Promise.resolve()
    emit({
      type: 'ready',
      count: ++ready,
      files: files?.map((file) => ({
        name: file.name,
        mode: file.mode,
        state: file.result?.state,
        self: file.file === file,
        cases: file.tasks.map((suite) => ({
          name: suite.name,
          file: suite.file === file,
          parent: suite.suite === undefined,
          tests: suite.tasks.map((test) => ({
            name: test.name,
            file: test.file === file,
            suite: test.suite === suite,
            privateParent: 'parentSuiteId' in test,
            meta: test.meta,
            state: test.result?.state,
          })),
        })),
      })),
    })
    if (
      (options.error === 'initial' && ready === 1) ||
      (options.error === 'later' && ready > 1)
    )
      throw new Error('actual ' + options.error + ' readiness failure')
  }
  async onWatcherRerun(files, trigger) {
    await Promise.resolve()
    emit({ type: 'rerun', files, trigger })
    if (options.error === 'rerun') throw new Error('actual rerun failure')
  }
  async onTestRemoved(file) {
    await Promise.resolve()
    emit({ type: 'removed', file })
    if (options.error === 'removed') throw new Error('actual removed failure')
  }
}
