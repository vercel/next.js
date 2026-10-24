const assert = require('node:assert/strict')
const path = require('node:path')
const { setImmediate } = require('node:timers/promises')
require('next/dist/server/require-hook')
const { deleteCache } = require('next/dist/server/dev/require-cache')

const runtimePath = path.join(__dirname, '[turbopack]_runtime.js')
const changedPath = path.join(__dirname, 'changed.cjs')
const sharedPath = path.join(__dirname, 'shared.cjs')
const references = []
let shared
let asynchronous

async function reload() {
  const exports = require(runtimePath)
  shared ??= exports.shared
  assert.equal(exports.shared, shared)
  const loadedAsync = await exports.loadAsync()
  asynchronous ??= loadedAsync
  assert.equal(loadedAsync, asynchronous)
  references.push({
    runtime: new WeakRef(require.cache[runtimePath]),
    exports: new WeakRef(exports),
    ballast: new WeakRef(exports.ballast),
  })
  const changedModule = require.cache[changedPath]
  const chunkParent = require.cache[sharedPath].parent
  deleteCache([runtimePath, changedPath, path.join(__dirname, 'relative.cjs')])
  assert.equal(require.cache[runtimePath], undefined)
  assert.equal(require.cache[changedPath], undefined)
  assert.ok(require.cache[sharedPath])
  assert.ok(!chunkParent.children.includes(changedModule))
}

async function main() {
  for (let i = 0; i < 30; i++) await reload()

  // WeakRef targets stay alive until the end of the current job. Cross a job
  // boundary before collecting, and do not dereference targets between GCs.
  for (let i = 0; i < 5; i++) {
    await setImmediate()
    global.gc()
  }

  console.log(
    JSON.stringify({
      retainedRuntimes: references.filter((ref) => ref.runtime.deref()).length,
      retainedExports: references.filter((ref) => ref.exports.deref()).length,
      retainedBallast: references.filter((ref) => ref.ballast.deref()).length,
      reloads: references.length,
    })
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
