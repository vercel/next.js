const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  childProcess = require('node:child_process')
const mode = process.argv[2],
  dist =
    process.argv[3] ??
    path.join(path.dirname(require.resolve('next/package.json')), 'dist')
assert.ok(['root', 'inline', 'external'].includes(mode))
const actualFork = childProcess.fork,
  children = [],
  joins = []
childProcess.fork = function (...args) {
  const child = Reflect.apply(actualFork, this, args)
  children.push(child)
  joins.push(
    Promise.all([
      new Promise((resolve, reject) => {
        child.once('exit', (code, signal) => resolve({ code, signal }))
        child.once('error', reject)
      }),
      ...[child.stdout, child.stderr]
        .filter(Boolean)
        .map(
          (stream) => new Promise((resolve) => stream.once('close', resolve))
        ),
    ])
  )
  return child
}
const { openTestConfiguration } = require(
  path.join(dist, 'experimental/testing/config')
)
let dir, config
;(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-controller-owner-'))
  await fs.cp(
    path.join(__dirname, 'reporter-controller-owner-fixtures', mode),
    dir,
    { recursive: true }
  )
  config = await openTestConfiguration(dir)
  assert.equal(config.finalExitOwnerAvailable, mode !== 'external')
  assert.equal(children.length, mode === 'external' ? 2 : 1)
  assert.equal(await config.prepareFinalExit(), undefined)
  await config.dispose()
  config = undefined
  const closed = await Promise.all(joins)
  assert.ok(closed.every(([exit]) => exit.code === 0 && exit.signal === null))
  assert.ok(children.every((child) => child.exitCode === 0))
  console.log(
    JSON.stringify({
      mode,
      node: process.version,
      actualPids: children.map((child) => child.pid),
      rootFinalOwnerAvailable: mode !== 'external',
      actualProcessCount: children.length,
      allObservedProcessesAndPipesJoined: true,
    })
  )
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    childProcess.fork = actualFork
    if (config) await config.dispose().catch(() => {})
    await Promise.allSettled(joins)
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  })
