import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const exec = promisify(execFile)

describe('next-testing-setup-compiler', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  async function run(
    environment: string,
    spec: string,
    setup: string[],
    strategy = 'childProcesses',
    mutateSetup = false
  ) {
    const { stdout } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs'), environment, spec, ...setup],
      {
        cwd: next.testDir,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TEST_PLUGIN_RUNTIME: strategy,
          NEXT_TEST_MUTATE_SETUP: mutateSetup ? '1' : '0',
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
      }
    )
    const marker = 'NEXT_TEST_CONTEXT_RESULT='
    const line = stdout.split('\n').find((line) => line.startsWith(marker))
    expect(line).toBeDefined()
    return JSON.parse(line!.slice(marker.length))
  }

  it.each(['childProcesses', 'workerThreads'])(
    'compiles ordered async setup with configured aliases and %s loaders',
    async (strategy) => {
      const setup = ['first.ts', 'second.ts']
      for (let repeat = 0; repeat < 2; repeat++) {
        const output = await run('node', 'node.ts', setup, strategy)
        expect(output.compilationError).toBeUndefined()
        expect(output.result.status).toBe('passed')
        expect(output.artifact.setupFiles).toEqual(
          setup.map((file) => join(next.testDir, 'setup', file))
        )
        expect(output.retained).toBe(true)
        expect(output.artifact.dependencyEvidence).toEqual({
          kind: 'emitted-output',
          complete: false,
          serverOutputs: expect.arrayContaining([
            expect.objectContaining({
              path: output.artifact.entryPath,
              contentHash: expect.any(String),
            }),
          ]),
        })
        for (const item of output.artifact.dependencyEvidence.serverOutputs) {
          expect(output.artifact.files).toContain(item.path)
          expect(item.contentHash.length).toBeGreaterThan(0)
        }
        expect(
          output.events.filter(
            (event: { type: string }) => event.type === 'case-end'
          )
        ).toHaveLength(1)
      }
    }
  )

  it('loads parent-allocated immutable setup after input source changes', async () => {
    const output = await run(
      'node',
      'node.ts',
      ['first.ts', 'second.ts'],
      'childProcesses',
      true
    )
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('passed')
    expect(output.artifact.rootDir).toContain('.next-test-parent-')
  })

  it('compiles setup with the RSC server layer', async () => {
    const output = await run('rsc', 'rsc.ts', [
      'first.ts',
      'second.ts',
      'rsc.ts',
    ])
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('passed')
    expect(output.artifact.kind).toBe('rsc')
  })

  it('retains the Node server-only boundary in setup', async () => {
    const output = await run('node', 'never.ts', ['rsc.ts'])
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('failed')
    expect(JSON.stringify(output.events)).toContain('Server Component')
    expect(JSON.stringify(output.events)).not.toContain(
      'spec must not evaluate'
    )
  })

  it('stops after rejected async setup before later setup or the spec', async () => {
    const output = await run('node', 'never.ts', ['fail.ts', 'never.ts'])
    expect(output.compilationError).toBeUndefined()
    expect(output.result.status).toBe('failed')
    expect(JSON.stringify(output.events)).toContain(
      'setup async rejection marker'
    )
    expect(JSON.stringify(output.events)).not.toContain(
      'later setup must not evaluate'
    )
    expect(JSON.stringify(output.events)).not.toContain(
      'spec must not evaluate'
    )
  })
})
