import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

// Explicit production compilation is independent of the surrounding harness mode.
describe('production test compiler', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      name: 'production-test-conditions',
      exports: {
        production: './conditions/production.js',
        development: './conditions/development.js',
        default: './conditions/default.js',
      },
    },
    skipStart: true,
  })
  it('executes optimized production test roots and setup in the real worker', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [join(next.testDir, 'run-compiler.cjs')],
      {
        cwd: next.testDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    console.log(stdout)
    expect(stdout).toContain('A3_PRODUCTION_COMPILER_PASSED')
  })
})
