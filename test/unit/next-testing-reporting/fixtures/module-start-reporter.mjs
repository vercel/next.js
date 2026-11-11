import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
let collected
const { mode, trace, release } = JSON.parse(
  readFileSync(join(process.cwd(), 'mode.json'), 'utf8')
)
const record = (event, module, extra = {}) =>
  appendFileSync(
    trace,
    JSON.stringify({
      event,
      state: module?.state(),
      sameCollected: module ? module === collected : undefined,
      ...extra,
    }) + '\n'
  )
export default class {
  constructor() {
    if (mode === 'absent' || mode.endsWith('-baseline'))
      this.onTestModuleStart = undefined
  }
  onTestModuleCollected(module) {
    collected = module
    record('collected', module)
  }
  async onTestModuleStart(module) {
    record('start', module)
    if (mode !== 'fulfilled')
      while (!existsSync(release))
        await new Promise((resolve) => setTimeout(resolve, 5))
    record('start-return', module)
    if (mode.endsWith('-error')) throw new Error('owned Start callback failure')
    // Preserve the actual primitive rejection occurrence in this fault control.
    // eslint-disable-next-line no-throw-literal
    if (mode.endsWith('-undefined')) throw undefined
  }
  onTestModuleEnd(module) {
    record('end', module)
  }
  onTestRunEnd(modules, errors, reason) {
    record('run-end', modules[0], {
      reason,
      errors: errors.map((error) => ({
        name: error?.name,
        message: error?.message,
      })),
    })
  }
}
