import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import {
  chmod,
  cp,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const ncc = require('@vercel/ncc')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist')
const types = join(root, '.build/types')
const docs = resolve(root, '../../docs')

async function build() {
  execFileSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '--emitDeclarationOnly'],
    { cwd: root, stdio: 'inherit' }
  )
  const result = await ncc(join(root, 'src/index.ts'), {
    minify: true,
    cache: false,
    sourceMap: false,
    license: 'LICENSE',
    filterAssetBase: join(root, '.build'),
    externals: ['@next/upgrade/package.json'],
  })
  await mkdir(output, { recursive: true })
  for (const [name, asset] of Object.entries(result.assets)) {
    const target = join(output, name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, asset.source)
  }
  await cp(types, join(output, 'types'), { recursive: true })
  await writeFile(join(output, 'index.d.ts'), "export * from './types/index'\n")
  await mkdir(join(output, 'bin'), { recursive: true })
  const bin = join(output, 'bin/next-upgrade.js')
  await writeFile(
    bin,
    `#!/usr/bin/env node\nrequire('../index.js').runCLI().catch((error) => {\n  console.error(error instanceof Error ? error.message : error)\n  process.exitCode = 1\n})\n`
  )
  await chmod(bin, 0o755)
  await cp(join(root, 'src/cli/agent/guides'), join(output, 'guides'), {
    recursive: true,
  })
  for (const router of ['01-app', '02-pages']) {
    const directory = `${router}/02-guides/upgrading`
    for (const file of await readdir(join(docs, directory))) {
      if (file === 'codemods.mdx' || /^version-\d+\.mdx$/.test(file)) {
        const target = join(
          output,
          'docs',
          directory,
          file.replace(/\.mdx$/, '.md')
        )
        await mkdir(dirname(target), { recursive: true })
        await cp(join(docs, directory, file), target)
      }
    }
  }
  const migration = '01-app/02-guides/migrating-to-cache-components'
  await cp(
    join(docs, `${migration}.mdx`),
    join(output, 'docs', `${migration}.md`)
  )
  // Readers always see a complete bundle, including during rapid source changes.
  const temporary = join(output, 'index.js.tmp')
  await writeFile(temporary, result.code)
  await rename(temporary, join(output, 'index.js'))
  console.log('Built @next/upgrade')
}

if (process.argv.includes('--watch')) {
  let pending = false
  let running = false
  async function rebuild() {
    pending = true
    if (running) {
      return
    }
    running = true
    try {
      while (pending) {
        pending = false
        await build()
      }
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    } finally {
      running = false
    }
  }
  watch(join(root, 'src'), { recursive: true }, () => {
    void rebuild()
  })
  // Watch only the documentation shipped with the package.
  for (const router of ['01-app', '02-pages']) {
    const directory = join(docs, router, '02-guides/upgrading')
    watch(directory, () => {
      void rebuild()
    })
  }
  watch(join(docs, '01-app/02-guides'), (_event, file) => {
    if (file === 'migrating-to-cache-components.mdx') {
      void rebuild()
    }
  })
  await rebuild()
} else {
  await rm(types, { recursive: true, force: true })
  await build()
}
