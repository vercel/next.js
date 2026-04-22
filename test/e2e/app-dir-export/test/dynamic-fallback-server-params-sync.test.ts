import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  expectOutputExportDevRedbox,
  startOutputExportDevServer,
} from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(
    __dirname,
    '..',
    'fixtures',
    'dynamic-fallback-server-params-sync'
  ),
  skipStart: true,
  skipDeployment: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export fallback server params sync access', () => {})
} else {
  const describeDevelopment = isNextDev ? describe : describe.skip
  const describeProduction = isNextDev ? describe.skip : describe

  describeDevelopment(
    'app dir - output export fallback server params sync access',
    () => {
      let port: number

      beforeAll(async () => {
        port = await startOutputExportDevServer(next)
      })

      afterAll(async () => {
        await next.destroy()
      })

      it('shows a redbox when a Server Component reads unresolved fallback params synchronously', async () => {
        await expectOutputExportDevRedbox({
          port,
          path: '/another/first',
          expectedMessage:
            'used unresolved dynamic params in a Server Component with "output: export"',
          expectedSource: 'params.slug',
        })
      })
    }
  )

  describeProduction(
    'app dir - output export fallback server params sync access',
    () => {
      afterAll(async () => {
        await next.destroy()
      })

      it('errors when a Server Component reads unresolved fallback params synchronously', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          'used unresolved dynamic params in a Server Component with "output: export"'
        )
        expect(cliOutput).toContain('/another/[slug]')
        expect(cliOutput).toContain('generateStaticParams()')
        expect(cliOutput).toContain('Client Component')
      })
    }
  )
}
