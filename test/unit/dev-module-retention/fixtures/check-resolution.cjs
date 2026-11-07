const assert = require('node:assert/strict')
const path = require('node:path')
require('next/dist/server/require-hook')

async function main() {
  const runtimePath = path.join(__dirname, '[turbopack]_runtime.js')
  const sharedPath = path.join(__dirname, 'shared.cjs')
  const runtime = require(runtimePath)
  // Read the parent before requiring the shared chunk from another module.
  const parent = require.cache[sharedPath].parent
  const stableParent = parent !== require.cache[runtimePath]
  assert.ok(parent)
  assert.ok(require.cache[parent.filename])
  assert.equal(
    require.cache[path.join(__dirname, 'relative.cjs')].parent,
    require.cache[runtimePath]
  )
  assert.throws(runtime.loadMissing, { code: 'MODULE_NOT_FOUND' })
  console.log(
    JSON.stringify({
      relative: runtime.relative === require('./relative.cjs'),
      absolute: runtime.shared === require(sharedPath),
      asynchronous:
        (await runtime.loadAsync()) ===
        require(path.join(__dirname, 'async.cjs')),
      missingModule: true,
      stableParent,
    })
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
