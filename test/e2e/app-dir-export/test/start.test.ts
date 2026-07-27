import { join } from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - with output export (next start)', () => {
  if (isNextStart) {
    const { next } = nextTestSetup({
      files: join(__dirname, '..'),
      skipStart: true,
    })

    it('should error during next start with output export', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      try {
        await next.start({ skipBuild: true })
      } catch (e) {}

      await retry(() => {
        expect(next.cliOutput).toContain(
          `"next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.`
        )
      })
    })

    it('should warn during next start with output standalone', async () => {
      await next.patchFile(
        'next.config.js',
        (content) =>
          content.replace(`output: 'export'`, `output: 'standalone'`),
        async () => {
          const { exitCode } = await next.build()
          expect(exitCode).toBe(0)

          try {
            await next.start({ skipBuild: true })
          } catch (e) {}

          await retry(() => {
            expect(next.cliOutput).toContain(
              `"next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
            )
          })
        }
      )
    })
  } else {
    it('skipped in dev', () => {})
  }
})
