import { appendFileSync } from 'node:fs'
import { basename } from 'node:path'
const emit = (value) =>
  appendFileSync(process.env.WATCH_EVENTS, JSON.stringify(value) + '\n')
let failed = false,
  runs = 0,
  readyCalls = 0
async function hook(type, value = {}) {
  if (type === 'ready') readyCalls++
  emit({ type: type + '-start', ...value })
  await Promise.resolve()
  if (
    !failed &&
    (process.env.WATCH_ERROR_KIND === type ||
      (process.env.WATCH_ERROR_KIND === 'ready-later' &&
        type === 'ready' &&
        readyCalls === 2))
  ) {
    failed = true
    emit({ type: type + '-error' })
    throw new Error('actual async ' + type + ' rejection')
  }
  emit({ type: type + '-after' })
}
export default class {
  onInit(context) {
    emit({ type: 'init' })
    context.onClose(async () => {
      await Promise.resolve()
      emit({ type: 'close', runs })
    })
  }
  onWatcherStart(files, errors) {
    return hook('ready', {
      files: files?.map((file) => basename(file.filepath)),
      errors: errors?.map((error) => error.message),
    })
  }
  onWatcherRerun(files, trigger) {
    return hook('rerun', {
      files: files.map((file) => basename(file)),
      trigger,
    })
  }
  onTestRemoved(trigger) {
    return hook('removed', { trigger: basename(trigger) })
  }
  onUserConsoleLog(log) {
    emit({ type: 'console', stream: log.type, text: log.content.trimEnd() })
  }
  onTestRunEnd(modules, errors, reason) {
    emit({
      type: 'end',
      run: ++runs,
      modules: modules.map((module) => ({
        file: basename(module.moduleId),
        state: module.state(),
        cases: [...module.children.allTests()].map((test) => ({
          name: test.name,
          state: test.result().state,
        })),
      })),
      errors: errors.map((error) => error.message),
      reason,
    })
  }
}
