const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')

;(async () => {
  const [rootArg, outputArg] = process.argv.slice(2)
  assert(rootArg && outputArg)
  const mode = process.argv.includes('--production')
    ? 'production'
    : 'development'
  const root = path.resolve(rootArg)
  const output = path.resolve(outputArg)
  const load = createRequire(path.join(root, 'package.json'))
  const { createTestCompilerSession } = load(
    'next/dist/experimental/testing/compiler'
  )
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
  )
  await fs.mkdir(output, { recursive: true })
  const fixture = await fs.mkdtemp(
    path.join(root, '.next-test-env-key-contract-')
  )
  const profile = {
    id: 'env-keys',
    environment: 'node',
    mode,
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = {
    id: 'env-keys:contract',
    file: path.join(fixture, 'contract.test.mjs'),
    profile,
  }
  const marker = path.join(output, 'authored-evaluation.txt')
  const code =
    "import{appendFileSync}from'node:fs';import{test,expect}from'vitest';appendFileSync(" +
    JSON.stringify(marker) +
    ",'spec\\n');test('environment key contract',()=>{appendFileSync(" +
    JSON.stringify(marker) +
    ",'body\\n');expect(1).toBe(1)})\n"
  await fs.writeFile(
    path.join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  await fs.symlink(
    path.join(root, 'node_modules'),
    path.join(fixture, 'node_modules')
  )
  await fs.writeFile(entry.file, code)
  await fs.writeFile(
    path.join(fixture, 'setup.mjs'),
    "import{appendFileSync}from'node:fs';appendFileSync(" +
      JSON.stringify(marker) +
      ",'setup\\n')\n"
  )
  await fs.writeFile(
    path.join(fixture, '.env.' + mode),
    'NEXT_PUBLIC_ENV_KEY_FILE=file-public\n'
  )
  await fs.writeFile(
    path.join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({
        env: { WS2_COMPILER_KEY: 'app-config' },
        turbopack: { root },
      }) +
      '\n'
  )
  const sessions = []
  let names
  try {
    for (const selected of [true, false, true]) {
      const session = await createTestCompilerSession(
        fixture,
        profile,
        selected ? { compilerEnvKeys: true } : {}
      )
      try {
        const first = await session.compile(entry, {
          signal: new AbortController().signal,
        })
        assert(!first.diagnostics.some((issue) => issue.severity === 'error'))
        if (selected) {
          const keys = first.compilerEnvKeys
          assert.equal(keys.version, 1)
          assert(keys.names.includes('process.env.NODE_ENV'))
          assert(keys.names.includes('process.env.NEXT_PUBLIC_ENV_KEY_FILE'))
          assert(keys.names.includes('process.env.WS2_COMPILER_KEY'))
          assert(!keys.names.includes('process.env.NODE_CUSTOM_ENV'))
          assert(!keys.names.includes('process.env.__CUSTOM_ENV'))
          assert(!JSON.stringify(keys).includes('app-config'))
          assert(!JSON.stringify(keys).includes('file-public'))
          const dependency = await session.compile(entry, {
            signal: new AbortController().signal,
            dependencyPlan: true,
          })
          assert(
            !dependency.diagnostics.some((issue) => issue.severity === 'error')
          )
          assert(dependency.sourceDependencies)
          assert(!Object.hasOwn(dependency, 'compilerEnvKeys'))
          const again = await session.compile(entry, {
            signal: new AbortController().signal,
          })
          assert.deepEqual(again.compilerEnvKeys, keys)
          names = keys.names
        } else assert(!Object.hasOwn(first, 'compilerEnvKeys'))
        await assert.rejects(fs.access(marker), { code: 'ENOENT' })
        sessions.push({
          selected,
          actualCompilerKeySnapshot: selected,
          compileOnlyMemberAbsent: true,
          authoredCodeNotEvaluated: true,
        })
      } finally {
        await session.dispose()
      }
    }
    await assert.rejects(
      createTestCompilerSession(fixture, profile, { compilerEnvKeys: false }),
      /explicit true/
    )
    const collisions = []
    const next = process.argv.includes('--source')
      ? path.join(root, 'packages/next/dist/bin/next')
      : load.resolve('next/dist/bin/next')
    for (const name of ['NEXT_PUBLIC_ENV_KEY_FILE', 'WS2_COMPILER_KEY']) {
      const evidence = path.join(output, name)
      await fs.mkdir(evidence)
      await fs.writeFile(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'env-keys',
              mode,
              setupFiles: ['./setup.mjs'],
              env: { [name]: 'test-override' },
            },
          ],
        }) + '\n'
      )
      const report = path.join(evidence, 'report.json')
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      }
      for (const key of [
        'CI',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      const owner = await runOwnedNode(
        [
          next,
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + report,
        ],
        {
          cwd: fixture,
          env,
          timeoutMs: 120000,
          auditDir: path.join(evidence, 'owners'),
        }
      )
      await fs.writeFile(
        path.join(evidence, 'OWNER.json'),
        JSON.stringify(owner, null, 2) + '\n'
      )
      await fs.writeFile(path.join(evidence, 'stdout.log'), owner.stdout)
      await fs.writeFile(path.join(evidence, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(owner, name)
      assert.equal(owner.status, 1)
      const raw = JSON.parse(await fs.readFile(report, 'utf8'))
      assert(
        raw.testResults.some((file) =>
          file.message.includes(
            'cannot override compiler-defined process.env.' + name
          )
        )
      )
      assert.equal(raw.numTotalTests, 0)
      await assert.rejects(fs.access(marker), { code: 'ENOENT' })
      collisions.push({
        name,
        refusedBeforeSetupSpecAndBody: true,
        ownersClosed: true,
      })
    }
    await fs.writeFile(
      path.join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          selectedAbsentSelectedSessions: sessions,
          actualNodeDefineNamesOnly: true,
          valuesNotExposed: true,
          snapshotsNotReusedFromAbsentSession: true,
          compileOnlyArtifactsUnchanged: true,
          collisions,
          allSessionsDisposed: true,
          sourceRoleAuthorityNotGranted: true,
          names,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    await fs.rm(fixture, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
