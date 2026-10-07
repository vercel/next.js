// ncc always names its output index.js, so the light terminal entry is
// built into its own directory. Move it next to dist/index.js: it loads the
// rest of the package through `require('./index')` at runtime.
import { readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../dist')
const entryDir = join(distDir, 'terminal')

const files = await readdir(entryDir)
if (files.length !== 1 || files[0] !== 'index.js') {
  throw new Error(
    `Expected only index.js in ${entryDir}, found: ${files.join(', ')}`
  )
}
await rename(join(entryDir, 'index.js'), join(distDir, 'terminal.js'))
await rm(entryDir, { recursive: true })
