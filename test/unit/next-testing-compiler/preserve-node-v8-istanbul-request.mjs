import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import Module, { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const [checkoutArg, outputArg, child] = process.argv.slice(2)
assert(checkoutArg && outputArg)
const checkout = realpathSync(resolve(checkoutArg)),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (child !== 'child') {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      join(
        checkout,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const env = {
    ...process.env,
    CI: '1',
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const owner = await runOwnedNode(
    [new URL(import.meta.url).pathname, checkout, output, 'child'],
    { cwd: checkout, env, auditDir: join(output, 'owners'), timeoutMs: 120000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'Istanbul preservation request false-role control'
  )
  assert.equal(owner.status, 0, owner.stderr)
  process.stdout.write(readFileSync(join(output, 'CHECKS.json')))
} else {
  const fixture = mkdtempSync(join(checkout, '.next-istanbul-request-control-'))
  const next = join(checkout, 'packages/next'),
    load = createRequire(join(next, 'package.json'))
  const original = Module._load,
    requests = []
  const observed = new Error('preservation native request observed')
  let shutdowns = 0,
    unlocks = 0,
    session
  const config = load(join(next, 'dist/server/config-shared')).defaultConfig
  const replacements = new Map([
    [
      load.resolve(join(next, 'dist/build/swc')),
      { loadBindings: async () => ({ isWasm: false }) },
    ],
    [
      load.resolve(join(next, 'dist/build/swc/dev-project')),
      {
        createDevTurbopackProject: async () => ({
          project: {
            testEntry: async (request) => {
              requests.push(structuredClone(request))
              throw observed
            },
            shutdown: async () => {
              shutdowns++
            },
          },
        }),
      },
    ],
    [
      load.resolve(join(next, 'dist/build/lockfile')),
      {
        Lockfile: {
          tryAcquire: () => ({
            unlock: async () => {
              unlocks++
            },
          }),
        },
      },
    ],
    [
      load.resolve(join(next, 'dist/server/config')),
      {
        __esModule: true,
        default: async () => ({
          ...config,
          distDir: '.next/dev',
          cacheComponents: true,
          turbopack: { root: fixture },
          experimental: { ...config.experimental, lockDistDir: true },
        }),
      },
    ],
    [
      load.resolve(join(next, 'dist/server/lib/router-utils/filesystem')),
      {
        setupFsCheck: async () => ({
          previewProps: {
            previewModeId: 'request-control',
            previewModeSigningKey: 'request-control',
            previewModeEncryptionKey: 'request-control',
          },
        }),
      },
    ],
  ])
  Module._load = function (request, parent, isMain) {
    let resolved
    try {
      resolved = Module._resolveFilename(request, parent)
    } catch {}
    return replacements.has(resolved)
      ? replacements.get(resolved)
      : Reflect.apply(original, this, arguments)
  }
  try {
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n')
    const file = join(fixture, 'source-role.test.mjs'),
      bytes = '// actual compiler request control\n'
    writeFileSync(file, bytes)
    symlinkSync(join(checkout, 'node_modules'), join(fixture, 'node_modules'))
    const profile = {
      id: 'rsc',
      environment: 'node',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    session = await load(
      join(next, 'dist/experimental/testing/compiler')
    ).createTestCompilerSession(fixture, profile, {
      istanbulInstrumentation: {
        version: 1,
        profile,
        transport: {
          version: 1,
          socket: join(fixture, 'unused.sock'),
          realm: 'request-control',
          revision: 'request-control',
        },
        metadata: { version: 1, sources: [] },
      },
    })
    await assert.rejects(
      session.compile(
        { id: 'source-role.test.mjs', file, profile },
        {
          signal: new AbortController().signal,
          coverage: { version: 1, kind: 'node-istanbul' },
        }
      ),
      (error) => error === observed
    )
    assert.equal(requests.length, 1)
    assert.equal(Object.hasOwn(requests[0], 'preserveCoverageSources'), false)
    assert.equal(Object.hasOwn(requests[0], 'sourceCoverage'), false)
    assert.equal(requests[0].environment, 'node')
    assert.equal(requests[0].runtimeEnv, true)
    assert.equal(readFileSync(file, 'utf8'), bytes)
    writeFileSync(
      join(output, 'ACTUAL-REQUEST.json'),
      JSON.stringify(requests[0], null, 2) + '\n'
    )
    await session.dispose()
    session = undefined
    assert.equal(shutdowns, 1)
    assert.equal(unlocks, 1)
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          actualIstanbulCompilerRequest: true,
          requests: 1,
          preserveCoverageSourcesAbsent: true,
          productionSourceCoverageAbsent: true,
          originalSourceUnchanged: true,
          actualCompilerOwnerDisposed: true,
          noNativeOutputRequested: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    try {
      await session?.dispose()
    } finally {
      Module._load = original
      rmSync(fixture, { recursive: true, force: true })
      writeFileSync(
        join(output, 'CLOSED.json'),
        JSON.stringify({
          fixtureRetired: !existsSync(fixture),
          moduleLoaderRestored: Module._load === original,
        }) + '\n'
      )
    }
  }
}
