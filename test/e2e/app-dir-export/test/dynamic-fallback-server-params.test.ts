import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  expectOutputExportDevRedbox,
  startOutputExportDevServer,
} from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'dynamic-fallback-server-params'),
  skipStart: true,
  skipDeployment: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export fallback server params', () => {})
} else {
  const describeDevelopment = isNextDev ? describe : describe.skip
  const describeProduction = isNextDev ? describe.skip : describe

  describeDevelopment('app dir - output export fallback server params', () => {
    let port: number

    beforeAll(async () => {
      port = await startOutputExportDevServer(next)
    })

    afterAll(async () => {
      await next.destroy()
    })

    it('shows a redbox when a Server Component awaits unresolved fallback params', async () => {
      await expectOutputExportDevRedbox({
        port,
        path: '/another/first',
        expectedMessage:
          'used unresolved dynamic params in a Server Component with "output: export"',
        expectedSource: 'await params',
      })
    })
  })

  describeProduction('app dir - output export fallback server params', () => {
    afterAll(async () => {
      await next.destroy()
    })

    it('errors when a Server Component awaits unresolved fallback params', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'used unresolved dynamic params in a Server Component with "output: export"'
      )
      expect(cliOutput).toContain('/another/[slug]')
      expect(cliOutput).toContain('generateStaticParams()')
      expect(cliOutput).toContain('Client Component')
    })
  })
}
