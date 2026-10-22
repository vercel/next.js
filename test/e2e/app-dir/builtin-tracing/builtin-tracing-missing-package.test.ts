import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

const MESSAGE =
  '`tracing: true` needs @vercel/otel, @opentelemetry/api, and @opentelemetry/api-logs.\n' +
  'Install them, or set `tracing: false`.'

describe('builtin-tracing without @vercel/otel', () => {
  // A deployment that fails to build cannot be asserted on.
  const { next, isNextDev, skipped } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'next.config.ts': new FileRef(
        join(__dirname, 'fixtures', 'tracing', 'next.config.ts')
      ),
    },
    dependencies: { '@opentelemetry/api': '1.9.1' },
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('fails with the missing package message', async () => {
    if (isNextDev) {
      await next.start().catch(() => {})
      await retry(() => {
        expect(next.cliOutput).toContain(MESSAGE)
      })
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(MESSAGE)
    }
  })
})
