const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')

async function main() {
  await require('next/dist/build/swc').loadBindings()
  const paths = Object.keys(require.cache).filter(
    (file) => file.endsWith('.node') && file.includes('next-swc')
  )
  assert.equal(paths.length, 1, 'Expected one actual host native binding')
  console.log(createHash('sha256').update(readFileSync(paths[0])).digest('hex'))
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
