import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  expectOutputExportDevCollapsedRedbox,
  expectOutputExportDevRedbox,
  startOutputExportDevServer,
} from './utils'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'output-export-server-io'),
  skipStart: true,
  skipDeployment: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export server io', () => {})
} else {
  const describeDevelopment = isNextDev ? describe : describe.skip
  const describeProduction = isNextDev ? describe.skip : describe

  describeDevelopment('app dir - output export server io', () => {
    let port: number

    beforeAll(async () => {
      port = await startOutputExportDevServer(next)
    })

    afterAll(async () => {
      await next.destroy()
    })

    it('shows a redbox when Date.now() is read outside use cache', async () => {
      await expectOutputExportDevCollapsedRedbox({
        port,
        path: '/needs-time',
        expectedMessage:
          'used `Date.now()` before accessing either uncached data',
        expectedSource: 'Date.now()',
      })
    })

    it('shows a redbox when Math.random() is read outside use cache', async () => {
      await expectOutputExportDevCollapsedRedbox({
        port,
        path: '/needs-random',
        expectedMessage:
          'used `Math.random()` before accessing either uncached data',
        expectedSource: 'Math.random()',
      })
    })

    it('shows a redbox when crypto.randomUUID() is read outside use cache', async () => {
      await expectOutputExportDevCollapsedRedbox({
        port,
        path: '/needs-crypto',
        expectedMessage:
          'used `crypto.randomUUID()` before accessing either uncached data',
        expectedSource: 'crypto.randomUUID()',
      })
    })

    it('still shows a redbox when request APIs are used inside use cache', async () => {
      await expectOutputExportDevRedbox({
        port,
        path: '/cached-request',
        expectedMessage: 'used `headers()` inside "use cache"',
        expectedSource: 'await headers()',
      })
    })
  })

  describeProduction('app dir - output export server io', () => {
    afterAll(async () => {
      await next.destroy()
    })

    it.each([
      [
        '/needs-time',
        'app/needs-time/page.js',
        'used `Date.now()` before accessing either uncached data',
      ],
      [
        '/needs-random',
        'app/needs-random/page.js',
        'used `Math.random()` before accessing either uncached data',
      ],
      [
        '/needs-crypto',
        'app/needs-crypto/page.js',
        'used `crypto.randomUUID()` before accessing either uncached data',
      ],
    ])(
      'errors when sync IO is used outside use cache for %s in output export',
      async (route, buildPath, expectedMessage) => {
        const { exitCode, cliOutput } = await next.build({
          args: ['--debug-build-paths', buildPath],
        })

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(expectedMessage)
        expect(cliOutput).toContain(route)
      }
    )

    it('still errors when request APIs are used inside use cache in output export', async () => {
      const { exitCode, cliOutput } = await next.build({
        args: ['--debug-build-paths', 'app/cached-request/page.js'],
      })

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain('used `headers()` inside "use cache"')
      expect(cliOutput).toContain('/cached-request')
    })
  })
}
