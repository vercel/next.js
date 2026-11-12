import { appendFileSync } from 'node:fs'
import { basename } from 'node:path'
const roots = new Map()
const write = (value) =>
  appendFileSync(
    process.env.MODE_TRACE,
    JSON.stringify({ actor: 'reporter', ...value }) + '\n'
  )
const tree = (t) => ({
  type: t.type,
  name: t.type === 'module' ? basename(t.moduleId) : t.name,
  state: t.type === 'test' ? t.result().state : t.state(),
  ...(t.type === 'module' ? {} : { mode: t.options.mode }),
  errors: t.type === 'test' ? [] : t.errors().map((e) => e.message),
  ...(t.type === 'test' ? {} : { children: [...t.children].map(tree) }),
})
export default class {
  onTestModuleQueued(m) {
    write({ event: 'queued', tree: tree(m) })
  }
  onTestModuleCollected(m) {
    roots.set(m.id, m)
    write({ event: 'collected', tree: tree(m) })
  }
  onTestCaseResult(t) {
    write({ event: 'case-result', tree: tree(t) })
  }
  onTestModuleEnd(m) {
    write({ event: 'end', sameCollected: m === roots.get(m.id), tree: tree(m) })
  }
  onTestRunEnd(modules, errors, reason) {
    write({
      event: 'run-end',
      reason,
      errors: errors.map((e) => e.message),
      modules: modules.map((m) => ({
        sameCollected: m === roots.get(m.id),
        tree: tree(m),
      })),
    })
  }
}
