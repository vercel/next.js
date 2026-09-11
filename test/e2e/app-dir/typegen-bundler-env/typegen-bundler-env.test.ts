import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

const baseEnv = {
  IS_TURBOPACK_TEST: undefined,
  TURBOPACK: undefined,
  IS_WEBPACK_TEST: undefined,
  NEXT_RSPACK: undefined,
  NEXT_TEST_USE_RSPACK: undefined,
}

// cssChunking: "graph", is Turbopack-only, so we use this as to verify whether
// typegen is selecting the right bundler
// This suite invokes the local typegen CLI with different bundler flags.
// Deploying the fixture does not exercise those local command invocations.
// @force-gate !deploy
describe('typegen bundler env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('defaults to Turbopack, accepting Turbopack-only config', async () => {
    const { code } = await runNextCommand(['typegen', next.testDir], {
      stderr: true,
      stdout: true,
      env: baseEnv,
    })
    expect(code).toBe(0)
  })

  it('rejects Turbopack-only config when --webpack is passed', async () => {
    const { code, stderr, stdout } = await runNextCommand(
      ['typegen', next.testDir, '--webpack'],
      {
        stderr: true,
        stdout: true,
        env: baseEnv,
      }
    )
    expect(code).not.toBe(0)
    expect(stderr + stdout).toMatch(/cssChunking.*Turbopack/i)
  })
})
