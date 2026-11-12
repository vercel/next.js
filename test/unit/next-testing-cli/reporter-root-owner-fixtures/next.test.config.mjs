import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const shared = {
  cache: require('./shared.cjs'),
  scenario: process.env.NEXT_TEST_ROOT_REPORTER_OWNER,
  trace(kind, extra = {}) {
    appendFileSync(
      path.join(process.cwd(), 'events.jsonl'),
      JSON.stringify({ kind, pid: process.pid, ...extra }) + '\n'
    )
  },
}
globalThis[Symbol.for('next.testing.root.reporter.owner')] = shared
shared.trace('config')
export default {
  test: { teardownTimeout: 250, globalSetup: ['./setup.mjs'] },
}
