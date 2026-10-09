import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { chmod, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const ncc = require('@vercel/ncc')
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(packageRoot, 'dist')
const typesRoot = join(packageRoot, '.build/types')
const entries = [
  { source: 'index', output: 'next', filename: 'index.js' },
  { source: 'bin/next-upgrade', output: 'bin', filename: 'next-upgrade.js' },
]

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
await chmod(join(outputRoot, 'bin/next-upgrade.js'), 0o755)

// Ship only documents referenced by the upgrade workflows, retaining their paths.
await cp(
  join(packageRoot, 'src/cli/agent/guides'),
  join(outputRoot, 'guides'),
  { recursive: true }
)
const docsRoot = resolve(packageRoot, '../../docs')
for (const router of ['01-app', '02-pages']) {
  const directory = `${router}/02-guides/upgrading`
  for (const file of await readdir(join(docsRoot, directory))) {
    if (file === 'codemods.mdx' || /^version-\d+\.mdx$/.test(file)) {
      const destination = join(
        outputRoot,
        'docs',
        directory,
        file.replace(/\.mdx$/, '.md')
      )
      await mkdir(dirname(destination), { recursive: true })
      await cp(join(docsRoot, directory, file), destination)
    }
  }
}
const migration = '01-app/02-guides/migrating-to-cache-components'
await cp(
  join(docsRoot, `${migration}.mdx`),
  join(outputRoot, 'docs', `${migration}.md`)
)
