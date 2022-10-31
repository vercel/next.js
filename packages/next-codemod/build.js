#!/usr/bin/env node
const fs = require('fs-extra')
const execa = require('execa')
const { join } = require('path')

async function main() {
  const outDir = join(__dirname, 'dist')
  const outBin = join(outDir, 'bin')
  const outFile = join(outDir, 'bin', 'index.js')

  // Start fresh
  await fs.remove(outDir)

  // Build with tsc since transformers should not be bundled
  await execa('tsc', [], { stdio: 'inherit', cwd: __dirname })

  // Build with `ncc` to bundle all dependencies into single file
  await execa('ncc', ['build', 'bin/next-codemod.ts', '-o', outBin], {
    stdio: 'inherit',
    cwd: __dirname,
  })

  // patch output file with a few fixes
  let str = await fs.readFile(outFile, 'utf8')
  str = str.replace('__REPLACE_WITH_JSCODESHIFT__', '.bin/jscodeshift')
  str = str.replace('path.dirname(module.parent.filename)', '__dirname')
  await fs.writeFile(outFile, str, 'utf8')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
