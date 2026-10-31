import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import execa from 'execa'
import path from 'node:path'

// Each child gets a fresh environment: the test runner's bundler is not the
// selection under test, and no child can set TURBOPACK for the next case.
describe('bundler selection contract', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'next-rspack': '*' },
  })
  function environment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'development',
      ...extra,
    }
    for (const name of [
      'IS_TURBOPACK_TEST',
      'IS_WEBPACK_TEST',
      'NEXT_RSPACK',
      'NEXT_TEST_USE_RSPACK',
      'TURBOPACK',
      'ROUTING_CONFIG_RSPACK',
    ])
      delete env[name]
    return { ...env, ...extra }
  }
  const cli = () => path.join(next.testDir, 'node_modules/next/dist/bin/next')

  for (const { name, flags, options, env, backend } of [
    { name: 'default', flags: [], options: {}, env: {}, backend: 'turbo' },
    {
      name: 'turbo alias',
      flags: ['--turbo'],
      options: { turbo: true },
      env: {},
      backend: 'turbo',
    },
    {
      name: 'turbopack',
      flags: ['--turbopack'],
      options: { turbopack: true },
      env: {},
      backend: 'turbo',
    },
    {
      name: 'webpack',
      flags: ['--webpack'],
      options: { webpack: true },
      env: {},
      backend: 'webpack',
    },
    {
      name: 'environment webpack',
      flags: [],
      options: {},
      env: { IS_WEBPACK_TEST: '1' },
      backend: 'webpack',
    },
    {
      name: 'environment Rspack',
      flags: [],
      options: {},
      env: { NEXT_RSPACK: '1' },
      backend: 'rspack',
    },
    {
      name: 'config Rspack overriding the automatic default',
      flags: [],
      options: {},
      env: { ROUTING_CONFIG_RSPACK: '1' },
      backend: 'rspack',
    },
  ]) {
    for (const host of ['CLI', 'custom'] as const) {
      it(`selects ${name} through ${host} using an actual compiled page`, async () => {
        const port = await findPort()
        const args =
          host === 'CLI'
            ? [cli(), 'dev', '--port', String(port), ...flags]
            : ['selection-server.cjs', String(port), JSON.stringify(options)]
        const child = execa(process.execPath, args, {
          cwd: next.testDir,
          env: environment(env),
          extendEnv: false,
          reject: false,
        })
        try {
          await retry(async () => {
            if (child.exitCode !== null) {
              const result = await child
              throw new Error(
                `Bundler child exited (code ${result.exitCode}, signal ${result.signal}):\n` +
                  result.stderr +
                  result.stdout
              )
            }
            const response = await fetch(`http://localhost:${port}`, {
              signal: AbortSignal.timeout(5000),
            })
            expect(response.status).toBe(200)
            expect(await response.text()).toContain(
              'bundler selection destination'
            )
          }, 30000)
          const manifest = await next.readJSON(
            '.next/dev/server/pages-manifest.json'
          )
          const bundle = await next.readFile(
            '.next/dev/server/' + manifest['/']
          )
          expect(bundle.includes('[turbopack]_runtime')).toBe(
            backend === 'turbo'
          )
          if (backend === 'rspack') expect(bundle).toMatch(/rspack/i)
          if (backend === 'webpack')
            expect(bundle).toContain('__webpack_require__')
        } finally {
          child.kill('SIGTERM', { forceKillAfterTimeout: 10000 })
          const result = await child
          expect(result.signal).not.toBe('SIGKILL')
          if (await next.hasFile('.next')) await next.deleteFile('.next')
        }
      })
    }
  }

  for (const { name, flags, options, env } of [
    {
      name: 'Turbo/Webpack',
      flags: ['--turbopack', '--webpack'],
      options: { turbopack: true, webpack: true },
      env: {},
    },
    {
      name: 'Turbo/Rspack',
      flags: ['--turbo'],
      options: { turbo: true },
      env: { NEXT_RSPACK: '1' },
    },
    {
      name: 'Webpack/Rspack',
      flags: ['--webpack'],
      options: { webpack: true },
      env: { NEXT_RSPACK: '1' },
    },
    {
      name: 'Turbo/Webpack/Rspack',
      flags: ['--turbo', '--webpack'],
      options: { turbo: true, webpack: true },
      env: { NEXT_RSPACK: '1' },
    },
  ]) {
    it(`rejects conflicting ${name} selections through the CLI`, async () => {
      const result = await execa(process.execPath, [cli(), 'dev', ...flags], {
        cwd: next.testDir,
        env: environment(env),
        extendEnv: false,
        reject: false,
        timeout: 15000,
      })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(
        /multiple bundler|not both|only one bundler/i
      )
    })
    it(`rejects conflicting ${name} selections through custom next()`, async () => {
      const result = await execa(
        process.execPath,
        ['-e', `require('next')(${JSON.stringify({ dev: true, ...options })})`],
        {
          cwd: next.testDir,
          env: environment(env),
          extendEnv: false,
          reject: false,
          timeout: 15000,
        }
      )
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr + result.stdout).toMatch(
        /multiple bundler|not both|only one bundler/i
      )
    })
  }
})
