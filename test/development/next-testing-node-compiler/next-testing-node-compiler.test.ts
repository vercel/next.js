import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, sep } from 'path'
import { access, cp, realpath, rename } from 'fs/promises'
import packageJson from './package.json'

const exec = promisify(execFile)

describe('next-testing-node-compiler', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson,
    skipStart: true,
  })

  async function run(environment: 'node' | 'rsc' | 'browser', file: string) {
    const { stdout } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs'), environment, file],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'development' },
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    const marker = 'NEXT_TEST_CONTEXT_RESULT='
    const result = stdout.split('\n').find((line) => line.startsWith(marker))
    expect(result).toBeDefined()
    return JSON.parse(result!.slice(marker.length))
  }

  it('compiles Node conditions and real project transforms without app or pages', async () => {
    const output = await run('node', 'node.tsx')
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('passed')
    expect(output.retained).toBe(true)
    expect(output.artifact.kind).toBe('node')
    expect(output.artifact).not.toHaveProperty('manifests')
    expect(output.artifact).not.toHaveProperty('requestContext')
    expect(
      output.events.filter(
        (event: { type: string }) => event.type === 'case-end'
      )
    ).toHaveLength(1)
  })

  it('preserves the default server-only poison module in a Node context', async () => {
    const output = await run('node', 'node-server-only.ts')
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('failed')
    expect(JSON.stringify(output.events)).toContain('Server Component')
  })

  it('rejects mutable external package links before publication', async () => {
    await cp(
      join(next.testDir, 'external-package'),
      join(next.testDir, 'node_modules/next-testing-external-probe'),
      { recursive: true }
    )
    const output = await run('node', 'external.ts')
    expect(output.compilationError).toMatch(
      /external package links|outside the server and client output roots/
    )
    expect(output).not.toHaveProperty('artifact')
  })

  it('keeps RSC package conditions and poison boundaries distinct', async () => {
    await cp(join(next.testDir, 'rsc-app'), join(next.testDir, 'app'), {
      recursive: true,
    })
    const output = await run('rsc', 'rsc.ts')
    expect(output.compilationError).toBeUndefined()
    expect(output.artifact.kind).toBe('rsc')
    expect(output.result.status).toBe('passed')
    const invalid = await run('rsc', 'rsc-client-only.ts')
    expect(invalid.compilationError).toMatch(/client-only|Client Component/)
  })

  it('publishes a Node browser-driver with actual application lock evidence', async () => {
    const output = await run('browser', 'node.tsx')
    expect(output.compilationError).toBeUndefined()
    expect(output.retained).toBe(true)
    expect(output.artifact).toEqual(
      expect.objectContaining({
        version: 2,
        kind: 'node',
        applicationServer: { mode: 'development', lockDistDir: true },
      })
    )
    expect(output.artifact.profile.environment).toBe('browser')
    expect(output.artifact).not.toHaveProperty('manifests')
  })
  it.each(['node', 'rsc'] as const)(
    'fails closed when the Next test facade is missing in %s',
    async (environment) => {
      const sentinel = join(next.testDir, 'node_modules/vitest')
      if (environment === 'node') {
        await expect(access(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
        await cp(join(next.testDir, 'poison-vitest'), sentinel, {
          recursive: true,
        })
      }
      const facade = await realpath(
        join(
          next.testDir,
          'node_modules/next/dist/experimental/testing/vitest.js'
        )
      )
      expect(facade.startsWith((await realpath(next.testDir)) + sep)).toBe(true)
      // Rename only the isolated package's facade; its real runner remains present.
      const missing = `${facade}.next-testing-missing`
      await rename(facade, missing)
      try {
        const output = await run(environment, 'facade.ts')
        expect({
          compilationError: output.compilationError,
          executedFallback: JSON.stringify(output.events ?? []).includes(
            'NEXT_TEST_FOREIGN_VITEST_FALLBACK'
          ),
        }).toEqual({
          compilationError: expect.stringContaining('vitest'),
          executedFallback: false,
        })
        expect(output).not.toHaveProperty('artifact')
      } finally {
        await rename(missing, facade)
      }
    }
  )
  it.each(['node', 'rsc'] as const)(
    'owns vitest imports from packaged helpers in %s',
    async (environment) => {
      await cp(
        join(next.testDir, 'packaged-helper'),
        join(next.testDir, 'node_modules/next-testing-packaged-helper'),
        { recursive: true }
      )
      const output = await run(environment, 'helper.ts')
      expect(output.compilationError).toBeUndefined()
      expect(output.result.status).toBe('passed')
      expect(JSON.stringify(output.events)).not.toContain(
        'NEXT_TEST_FOREIGN_VITEST_FALLBACK'
      )
      expect(
        output.events.filter(
          (event: { type: string }) => event.type === 'case-end'
        )
      ).toHaveLength(1)
    }
  )
  it.each(['childProcesses', 'workerThreads'])(
    'runs real %s loaders in sequential compiler sessions in one process',
    async (strategy) => {
      const { stdout } = await exec(
        process.execPath,
        [join(next.testDir, 'sessions.cjs')],
        {
          cwd: next.testDir,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            NEXT_TEST_PLUGIN_RUNTIME: strategy,
          },
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000,
        }
      )
      const marker = 'NEXT_TEST_CONTEXT_RESULT='
      const result = stdout.split('\n').find((line) => line.startsWith(marker))
      expect(result).toBeDefined()
      expect(JSON.parse(result!.slice(marker.length))).toEqual([
        {
          status: 'passed',
          resourcesClosed: true,
          names: ['loader value: first'],
        },
        {
          status: 'passed',
          resourcesClosed: true,
          names: ['loader value: second'],
        },
      ])
    }
  )
})
