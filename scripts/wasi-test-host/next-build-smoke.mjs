import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const scratchRoot = await mkdtemp(
  path.join(path.dirname(repoRoot), 'next-wasi-build-smoke-')
)
const sitePath = path.join(scratchRoot, 'site')
const packagePath = path.join(repoRoot, 'packages/next-swc-wasm-wasi')
const targetLog = path.join(scratchRoot, 'targets.jsonl')
const nextBin = path.join(sitePath, 'node_modules/next/dist/bin/next')
async function writeConfig(experimental = {}) {
  await writeFile(
    path.join(sitePath, 'next.config.ts'),
    `import type { NextConfig } from 'next'

const config: NextConfig = {
  turbopack: { root: ${JSON.stringify(path.dirname(repoRoot))} },
  experimental: ${JSON.stringify(experimental)},
}

export default config
`
  )
}

async function runBuild(args, env = {}) {
  return execFile(process.execPath, [nextBin, 'build', ...args], {
    cwd: sitePath,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_TEST_WASI_DIR: packagePath,
      NEXT_TEST_NATIVE_DIR: path.join(scratchRoot, 'native-must-not-load'),
      NEXT_TEST_WASI_TARGET_LOG: targetLog,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096']
        .filter(Boolean)
        .join(' '),
      ...env,
    },
    maxBuffer: 50 * 1024 * 1024,
    timeout: 240_000,
  })
}

async function expectFailure(args, pattern, env) {
  let failure
  try {
    await runBuild(args, env)
  } catch (error) {
    failure = error
  }
  assert.ok(failure, `next build ${args.join(' ')} unexpectedly succeeded`)
  assert.match(`${failure.stdout ?? ''}\n${failure.stderr ?? ''}`, pattern)
}

try {
  await mkdir(path.join(sitePath, 'app'), { recursive: true })
  // The WASI filesystem resolver on Node 20.9 cannot follow the workspace's
  // symlinked node_modules/next. Put the built package at the project's actual
  // resolution path while retaining the other workspace dependencies.
  await mkdir(path.join(sitePath, 'node_modules/next'), { recursive: true })
  await copyFile(
    path.join(repoRoot, 'packages/next/package.json'),
    path.join(sitePath, 'node_modules/next/package.json')
  )
  await cp(
    path.join(repoRoot, 'packages/next/dist'),
    path.join(sitePath, 'node_modules/next/dist'),
    { recursive: true }
  )
  for (const name of ['index.d.ts', 'types.js', 'types.d.ts']) {
    await copyFile(
      path.join(repoRoot, 'packages/next', name),
      path.join(sitePath, 'node_modules/next', name)
    )
  }
  for (const name of ['types', 'image-types']) {
    await cp(
      path.join(repoRoot, 'packages/next', name),
      path.join(sitePath, 'node_modules/next', name),
      { recursive: true }
    )
  }
  for (const name of ['react', 'react-dom', '@swc/helpers']) {
    await mkdir(path.dirname(path.join(sitePath, 'node_modules', name)), {
      recursive: true,
    })
    await cp(
      await realpath(path.join(repoRoot, 'node_modules', name)),
      path.join(sitePath, 'node_modules', name),
      { recursive: true }
    )
  }
  const reactDomRequire = createRequire(
    path.join(
      await realpath(path.join(repoRoot, 'node_modules/react-dom')),
      'package.json'
    )
  )
  await cp(
    path.dirname(reactDomRequire.resolve('scheduler/package.json')),
    path.join(sitePath, 'node_modules/scheduler'),
    { recursive: true }
  )
  await mkdir(path.join(sitePath, 'node_modules/@types'))
  await mkdir(path.join(sitePath, 'node_modules/@next'))
  for (const name of [
    'typescript',
    '@types/react',
    '@types/node',
    '@next/env',
    'baseline-browser-mapping',
    'caniuse-lite',
    'postcss',
    'styled-jsx',
  ]) {
    let source
    try {
      source = await realpath(path.join(repoRoot, 'node_modules', name))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      source = await realpath(
        path.join(repoRoot, 'packages/next/node_modules', name)
      )
    }
    await symlink(source, path.join(sitePath, 'node_modules', name), 'dir')
  }
  await readFile(path.join(packagePath, 'next-swc.wasm32-wasi.wasm'))
  await writeFile(
    path.join(sitePath, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies: {
        next: JSON.parse(
          await readFile(path.join(sitePath, 'node_modules/next/package.json'))
        ).version,
        react: JSON.parse(
          await readFile(path.join(sitePath, 'node_modules/react/package.json'))
        ).version,
        'react-dom': JSON.parse(
          await readFile(
            path.join(sitePath, 'node_modules/react-dom/package.json')
          )
        ).version,
      },
    })
  )
  await writeFile(
    path.join(sitePath, 'app/layout.tsx'),
    `import './style.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>
}
`
  )
  await writeFile(
    path.join(sitePath, 'app/page.tsx'),
    `export default function Page() {
  return <main>Built by WASI</main>
}
`
  )
  await writeFile(
    path.join(sitePath, 'app/style.css'),
    'main { color: rgb(0 100 200); }\n'
  )
  await writeConfig({ turbopackFileSystemCacheForBuild: true })

  const buildHelp = await runBuild(['--help'])
  assert.match(
    buildHelp.stdout,
    /--wasi\s+Builds using the experimental WASI bindings/
  )
  const devHelp = await execFile(process.execPath, [nextBin, 'dev', '--help'], {
    cwd: sitePath,
  })
  assert.doesNotMatch(devHelp.stdout, /--wasi/)

  const { stdout, stderr } = await runBuild(['--wasi'])
  const output = `${stdout}\n${stderr}`
  assert.match(output, /Running next\.config\.ts/)
  assert.match(output, /Compiled successfully/)
  assert.match(output, /Route \(app\)/)
  assert.equal(
    output.match(/Turbopack filesystem caching is disabled for --wasi/g)
      ?.length,
    1
  )
  assert.equal(
    await readFile(path.join(sitePath, '.next/BUILD_ID'), 'utf8').then(Boolean),
    true
  )
  assert.match(
    await readFile(path.join(sitePath, '.next/server/app/index.html'), 'utf8'),
    /Built by WASI/
  )

  const targetRecords = (await readFile(targetLog, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.ok(targetRecords.length >= 2)
  assert.ok(targetRecords.some(({ worker }) => !worker))
  assert.ok(targetRecords.some(({ worker }) => worker))
  assert.ok(
    targetRecords.every(({ target }) => target === 'wasm32-wasip1-threads')
  )

  async function findSst(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (await findSst(entryPath)) return true
      } else if (entry.name.endsWith('.sst')) {
        return true
      }
    }
    return false
  }
  assert.equal(await findSst(path.join(sitePath, '.next')), false)

  await expectFailure(
    ['--wasi', '--webpack'],
    /--wasi is only compatible with the Turbopack bundler/
  )
  await writeConfig({ useWasmBinary: true })
  await expectFailure(
    ['--wasi'],
    /cannot be combined with `experimental\.useWasmBinary: true`/
  )
  await writeConfig()
  await expectFailure(
    ['--wasi'],
    /Failed to initialize @next\/swc-wasm-wasi@.*from .*missing-wasi-package/,
    { NEXT_TEST_WASI_DIR: path.join(scratchRoot, 'missing-wasi-package') }
  )

  console.log(
    'next build --wasi completed through the parent and build workers; negative CLI cases passed'
  )
} finally {
  await rm(scratchRoot, { recursive: true, force: true })
}
