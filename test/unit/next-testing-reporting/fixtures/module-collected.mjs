import {
  appendFileSync,
  existsSync,
  readFileSync,
  watchFile,
  unwatchFile,
} from 'node:fs'
import { join } from 'node:path'
const options = JSON.parse(readFileSync('collected-options.json', 'utf8'))
const views = new Map()
const row = (value) =>
  appendFileSync('collected-trace.jsonl', JSON.stringify(value) + '\n')
const state = (module) => ({
  id: module.id,
  state: module.state(),
  children: module.children.size,
  errors: module.errors().map((error) => error.message),
  tests: [...module.children.allTests()].map((test) => ({
    name: test.name,
    state: test.result().state,
  })),
})
export default class {
  async onTestModuleCollected(module) {
    views.set(module.id, module)
    row({ event: 'collected', ...state(module) })
    if (options.reject) throw new Error('owned collected reporter failure')
    const release = join(options.root, 'release')
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
    row({ event: 'collected-return', ...state(module) })
  }
  onTestModuleEnd(module) {
    row({
      event: 'end',
      same: module === views.get(module.id),
      ...state(module),
    })
  }
  onTestRunEnd(modules, errors, reason) {
    row({
      event: 'run-end',
      errors: errors.map((error) => error.message),
      reason,
      modules: modules.map(state),
    })
  }
}
