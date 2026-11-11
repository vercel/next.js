const assert = require('node:assert/strict')
const fs = require('node:fs')
const { mkdtemp, realpath, writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')

async function main() {
  const [processModule, filesModule, schedulingModule, mode] =
    process.argv.slice(2)
  assert(['development', 'production'].includes(mode))
  assert.equal(process.env.NODE_ENV, mode)
  const { runWatchProcess } = require(processModule)
  const { watchTestFiles } = require(filesModule)
  const { acquireTestRunLock } = require(schedulingModule)
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'next-watch-owned-lock-'))
  )
  let watcher
  let lock
  let sourceObserved = false
  const changes = []
  const errors = []
  try {
    await writeFile(
      path.join(root, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
    )
    const result = await runWatchProcess(
      {
        operation: 'metadata',
        projectDir: root,
        profiles: [
          {
            id: 'node',
            mode,
            environment: 'node',
            runtime: 'nodejs',
            bundler: 'turbopack',
          },
        ],
      },
      { signal: new AbortController().signal, write() {} }
    )
    assert.equal(result.operation, 'metadata')
    const lockFile = path.join(root, '.next-test-run.lock')
    assert(result.directories.outputFiles.includes(lockFile))
    const barrier = path.join(root, 'actual-source.ts')
    let observe
    const observed = new Promise((resolve, reject) => {
      observe = resolve
      AbortSignal.timeout(20000).addEventListener(
        'abort',
        () => reject(new Error('Actual source barrier was not observed.')),
        { once: true }
      )
    })
    watcher = await watchTestFiles({
      ...result.directories,
      onChange(change) {
        changes.push(change)
        if (change.changed.includes(barrier)) observe()
      },
      onError(error) {
        errors.push(error)
      },
    })
    lock = await acquireTestRunLock(root, { recoverSnapshots: false })
    assert(fs.existsSync(lockFile))
    await lock.unlock()
    lock = undefined
    await writeFile(barrier, 'export const actual = 1\n')
    await observed
    sourceObserved = true
    assert.deepEqual(errors, [])
    assert(!changes.flatMap((change) => change.changed).includes(lockFile))
    assert(!changes.flatMap((change) => change.removed).includes(lockFile))
  } finally {
    await lock?.unlock()
    await watcher?.close()
    await rm(root, { recursive: true, force: true })
  }
  assert(!fs.existsSync(root))
  process.stdout.write(
    JSON.stringify({
      mode,
      actualLockOutputExcluded: true,
      sourceObserved,
      closed: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
