import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const ncc = require('@vercel/ncc')
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(packageRoot, 'dist')
const typesRoot = join(packageRoot, '.build/types')
const entries = [{ source: 'index', output: 'next', filename: 'index.js' }]

await rm(outputRoot, { recursive: true, force: true })
await rm(typesRoot, { recursive: true, force: true })
execFileSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
  {
    cwd: packageRoot,
    stdio: 'inherit',
  }
)

for (const entry of entries) {
  const output = join(outputRoot, entry.output)
  await mkdir(output, { recursive: true })
  const result = await ncc(join(packageRoot, 'src', `${entry.source}.ts`), {
    minify: true,
    cache: false,
    sourceMap: false,
    license: 'LICENSE',
    // Assets are copied explicitly below; dynamic app paths must remain runtime paths.
    filterAssetBase: join(packageRoot, '.build'),
    externals: ['@next/upgrade/package.json'],
  })
  await writeFile(join(output, entry.filename), result.code)
  for (const [name, asset] of Object.entries(result.assets)) {
    const target = join(output, name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, asset.source)
  }
}

// TypeScript emits the public entry's declaration graph; Next vendors it with the bundle.
await cp(typesRoot, join(outputRoot, 'next/types'), { recursive: true })
await writeFile(
  join(outputRoot, 'next/index.d.ts'),
  "export * from './types/index'\n"
)
