import { nextTestSetup } from 'e2e-utils'
import { initNextServerScript, retry } from 'next-test-utils'
import path from 'path'

describe.each([false, true])('future-compat enabled: %s', (futureCompat) => {
  const originalFutureCompat = process.env.NEXT_TEST_FUTURE_COMPAT

  beforeAll(() => {
    process.env.NEXT_TEST_FUTURE_COMPAT = futureCompat ? '1' : ''
  })

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NODE_OPTIONS: '--stack-trace-limit=42' },
  })

  afterAll(() => {
    if (originalFutureCompat === undefined) {
      delete process.env.NEXT_TEST_FUTURE_COMPAT
    } else {
      process.env.NEXT_TEST_FUTURE_COMPAT = originalFutureCompat
    }
  })

  function expectDeprecationResult(code: unknown, output: string) {
    expect(output).toContain('DEP_FUTURE_COMPAT_TEST')
    expect(code).toBe(futureCompat ? 1 : 0)
  }

  it.each([undefined, '--stack-trace-limit=43'])(
    'enforces the mode when building with NODE_OPTIONS=%s',
    async (nodeOptions) => {
      const result = await next.build({
        env:
          nodeOptions === undefined ? undefined : { NODE_OPTIONS: nodeOptions },
      })
      expectDeprecationResult(result.exitCode, result.cliOutput)
    }
  )

  it('enforces the mode for direct CLI commands', async () => {
    const result = await next.runCommand(['build'], {
      env: { NODE_OPTIONS: '--stack-trace-limit=43' },
    })
    expectDeprecationResult(result.exitCode, result.cliOutput)
  })

  it('enforces the mode for custom build commands', async () => {
    const originalBuildCommand = next.buildCommand
    next.buildCommand = 'node deprecation.cjs'
    try {
      const result = await next.build({
        env: { NODE_OPTIONS: '--stack-trace-limit=43' },
      })
      expectDeprecationResult(result.exitCode, result.cliOutput)
    } finally {
      next.buildCommand = originalBuildCommand
    }
  })

  it('enforces the mode for legacy command helpers', async () => {
    let stderr = ''
    const result = initNextServerScript(
      path.join(next.testDir, 'deprecation.cjs'),
      /deprecation test finished/,
      { ...process.env, NODE_OPTIONS: '--stack-trace-limit=43' },
      undefined,
      {
        shouldRejectOnError: true,
        onStderr: (chunk) => {
          stderr += chunk
        },
      }
    )
    if (futureCompat) {
      await expect(result).rejects.toThrow('exited with code: 1')
    } else {
      await result
    }
    await retry(() => {
      expect(stderr).toContain('DEP_FUTURE_COMPAT_TEST')
    })
  })
})
