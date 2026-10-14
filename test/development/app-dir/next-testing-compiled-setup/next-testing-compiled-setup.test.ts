import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const exec = promisify(execFile)

describe('next-testing-compiled-setup', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  async function run(mode: string) {
    const { stdout } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs'), mode],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'development' },
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    const marker = 'COMPILED_SETUP_RESULT='
    const line = stdout.split('\n').find((value) => value.startsWith(marker))
    expect(line).toBeDefined()
    return JSON.parse(line!.slice(marker.length)) as {
      setupFiles: string[]
      requested: string[]
      result: { status: string }
      originalSnapshot?: string
      snapshot?: string
      events: {
        type: string
        status?: string
        text?: string
        diagnostic?: { phase: string; message: string }
      }[]
    }[]
  }

  it('commits explicit snapshot updates only after the worker exits and preserves unchecked entries', async () => {
    const [outcome] = await run('snapshot')
    expect(outcome.result.status).toBe('passed')
    expect(outcome.snapshot).toContain('"updated"')
    expect(outcome.snapshot).toContain(
      'exports[`unselected 1`] = `"preserved"`'
    )
    expect(outcome.snapshot).not.toEqual(outcome.originalSnapshot)
  })

  it.each(['snapshot-nonzero', 'snapshot-late'])(
    'does not commit a staged passing snapshot after %s',
    async (mode) => {
      const [outcome] = await run(mode)
      expect(
        outcome.events.filter((event) => event.type === 'case-end')
      ).toEqual([expect.objectContaining({ status: 'passed' })])
      const output = outcome.events.map((event) => event.text || '').join('')
      expect(output).toContain('SNAPSHOT_WORKER_STATUS=passed')
      expect(output).toContain('SETUP_DISPOSAL=original')
      expect(outcome.result.status).toBe('failed')
      expect(outcome.snapshot).toEqual(outcome.originalSnapshot)
    }
  )

  it('leaves snapshots byte-identical without explicit update opt-in', async () => {
    const [outcome] = await run('snapshot-readonly')
    expect(outcome.result.status).toBe('failed')
    expect(outcome.snapshot).toEqual(outcome.originalSnapshot)
  })

  it('loads async setup in order with shared module, matcher and hook identities in fresh files', async () => {
    const outcomes = await run('ordered')
    expect(outcomes).toHaveLength(2)
    for (const outcome of outcomes) {
      expect(outcome.setupFiles).toEqual(outcome.requested)
      expect(outcome.result.status).toBe('passed')
      const cases = outcome.events.filter((event) => event.type === 'case-end')
      expect(cases).toHaveLength(2)
      expect(cases.every((event) => event.status === 'passed')).toBe(true)
      expect(
        outcome.events.map((event) => event.text || '').join('')
      ).toContain('SETUP_DISPOSAL=original')
    }
  })

  it('reports an async setup rejection without evaluating later setup/spec and still restores spies', async () => {
    const [outcome] = await run('failure')
    expect(outcome.result.status).toBe('failed')
    expect(
      outcome.events.filter((event) => event.type === 'case-start')
    ).toHaveLength(0)
    expect(outcome.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic',
          diagnostic: expect.objectContaining({
            phase: 'collection',
            message: 'intentional asynchronous setup rejection',
          }),
        }),
      ])
    )
    const output = outcome.events.map((event) => event.text || '').join('')
    expect(output).toContain('SETUP_DISPOSAL=original')
    expect(output).not.toContain('FORBIDDEN_SETUP_EVALUATED')
    expect(output).not.toContain('FORBIDDEN_SPEC_EVALUATED')
  })
})
