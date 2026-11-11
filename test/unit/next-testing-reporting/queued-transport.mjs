import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [role, mode, output] = process.argv.slice(2)
const file = fileURLToPath(import.meta.url)
if (role !== 'parent') {
  const result = await runOwnedNode([file, 'parent', role, mode], {
    cwd: dirname(file),
    env: process.env,
    auditDir: mode + '.owners',
    timeoutMs: 30000,
  })
  writeFileSync(mode + '.result.json', JSON.stringify(result, null, 2) + '\n')
  assertOwnedNodeCompleted(result, 'queued module transport ' + role)
  if (result.status !== 0) throw new Error(result.stderr)
} else {
  const require = createRequire(import.meta.url)
  const worker = require.resolve('next/dist/experimental/testing/watch-worker')
  const dist = dirname(dirname(dirname(worker)))
  const {
    runWatchProcess,
  } = require('next/dist/experimental/testing/watch-process')
  const {
    serializeDiagnostic,
  } = require('next/dist/experimental/testing/reporting/diagnostics')
  process.env.QUEUED_WORKER_DIST = dist
  process.env.QUEUED_FAULT_MODE = mode
  process.env.NODE_OPTIONS =
    (process.env.NODE_OPTIONS || '') +
    ' --require=' +
    join(dirname(file), 'queued-transport-preload.cjs')
  const profile = {
    id: 'owned',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  let rejected = false
  try {
    await runWatchProcess(
      {
        operation: 'run',
        isolatedProfile: true,
        captureModuleQueued: true,
        projectDir: dirname(file),
        projects: [
          {
            profile,
            entries: [
              {
                id: 'owned:case',
                file: join(dirname(file), 'case.mjs'),
                profile,
              },
            ],
            setupFiles: [],
            include: [],
            exclude: [],
          },
        ],
      },
      { signal: new AbortController().signal, onModuleQueued() {}, write() {} }
    )
  } catch (error) {
    rejected = true
    writeFileSync(
      output,
      JSON.stringify(
        serializeDiagnostic(error, { phase: 'runtime' }),
        null,
        2
      ) + '\n'
    )
  }
  if (!rejected)
    throw new Error('queued transport fault unexpectedly succeeded')
}
