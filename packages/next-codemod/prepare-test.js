#!/usr/bin/env node
const fs = require('fs-extra')
const { join } = require('path')
async function main() {
  const srcTransforms = join(__dirname, 'transforms')
  const distTransforms = join(__dirname, 'dist', 'transforms')

  await fs.remove(join(distTransforms, '__testfixtures__'))
  await fs.remove(join(distTransforms, '__tests__'))

  await fs.copy(
    join(srcTransforms, '__testfixtures__'),
    join(distTransforms, '__testfixtures__')
  )
  await fs.copy(
    join(srcTransforms, '__tests__'),
    join(distTransforms, '__tests__')
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
