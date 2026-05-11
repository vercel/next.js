import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  expectOutputExportDevRedbox,
  startOutputExportDevServer,
} from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'output-export-server-headers'),
  skipStart: true,
  skipDeployment: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export server headers', () => {})
} else {
  const describeDevelopment = isNextDev ? describe : describe.skip
  const describeProduction = isNextDev ? describe.skip : describe

  describeDevelopment('app dir - output export server headers', () => {
    let port: number

    beforeAll(async () => {
      port = await startOutputExportDevServer(next)
    })

    afterAll(async () => {
      await next.destroy()
    })

    it('shows a redbox when a Server Component awaits headers() in output export', async () => {
      await expectOutputExportDevRedbox({
        port,
        path: '/needs-headers',
        expectedMessage:
          'used `headers()` in a Server Component with "output: export"',
        expectedSource: 'await headers()',
      })
    })
  })

  describeProduction('app dir - output export server headers', () => {
    afterAll(async () => {
      await next.destroy()
    })

    it('errors when a Server Component awaits headers() in output export', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'used `headers()` in a Server Component with "output: export"'
      )
      expect(cliOutput).toContain('/needs-headers')
      expect(cliOutput).toContain('runtime server request')
    })
  })
}
