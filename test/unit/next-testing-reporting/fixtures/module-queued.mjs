import {
  appendFileSync,
  existsSync,
  readFileSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
const options = JSON.parse(readFileSync('queued-options.json', 'utf8'))
const queued = new Map()
const row = (value) =>
  appendFileSync('queued-trace.jsonl', JSON.stringify(value) + '\n')
const shape = (module) => ({
  id: module.id,
  file: basename(module.moduleId),
  relative: module.relativeModuleId,
  project: module.project.name,
  type: module.type,
  state: module.state(),
  children: module.children.size,
  errors: module.errors().map((error) => error.message),
})
export default class {
  onInit(context) {
    context.onClose(() => row({ event: 'close' }))
    writeFileSync('queued-init.json', JSON.stringify({ pid: process.pid }))
  }
  async onTestModuleQueued(module) {
    const file = basename(module.moduleId)
    queued.set(file, module)
    row({ event: 'queued', ...shape(module) })
    if (options.reject) throw new Error('owned queued reporter failure')
    const release = join(options.root, file + '.release')
    await new Promise((resolve) => {
      const check = () => {
        if (existsSync(release)) {
          unwatchFile(release, check)
          resolve()
        }
      }
      watchFile(release, { interval: 10 }, check)
      check()
    })
    row({ event: 'queued-return', ...shape(module) })
  }
  onTestModuleEnd(module) {
    const snapshot = queued.get(basename(module.moduleId))
    row({
      event: 'end',
      same: snapshot === module,
      queuedState: snapshot?.state(),
      queuedChildren: snapshot?.children.size,
      ...shape(module),
    })
  }
  onTestRunEnd(modules, errors, reason) {
    row({
      event: 'run-end',
      errors: errors.map((error) => error.message),
      reason,
      modules: modules.map(shape),
    })
  }
}
