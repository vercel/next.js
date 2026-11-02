const assert = require('node:assert/strict')
const { deleteCache } = require(process.argv[2])

require('./parent.cjs')
const filename = require.resolve('./parent.cjs')
const parent = require.cache[filename]
const childFilename = require.resolve('./child.cjs')
const child = require.cache[childFilename]

deleteCache([filename])

assert.equal(require.cache[filename], undefined)
assert.equal(module.children.includes(parent), false)
assert.equal(require.cache[childFilename], child)
if (Number.parseInt(process.versions.node, 10) <= 20) {
  assert.equal(child.parent, null)
}

require('./parent.cjs')
assert.notEqual(require.cache[filename], parent)
assert.equal(require.cache[childFilename], child)
console.log('cache invalidation passed')
