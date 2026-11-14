import { execFile } from 'child_process'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

describe('Turbopack runtime require parents', () => {
  it('collects invalidated runtimes while shared chunks remain cached', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--expose-gc', join(__dirname, 'fixtures/check-retention.cjs')],
      { env: { ...process.env, NODE_ENV: 'development' } }
    )
    expect(JSON.parse(stdout)).toEqual({
      retainedRuntimes: 0,
      retainedExports: 0,
      retainedBallast: 0,
      reloads: 30,
    })
  })

  it.each(['development', 'production'] as const)(
    'preserves resolution and cached exports in %s',
    async (nodeEnv) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        [join(__dirname, 'fixtures/check-resolution.cjs')],
        { env: { ...process.env, NODE_ENV: nodeEnv } }
      )
      expect(JSON.parse(stdout)).toEqual({
        relative: true,
        absolute: true,
        asynchronous: true,
        missingModule: true,
        stableParent: nodeEnv === 'development',
      })
    }
  )
})
