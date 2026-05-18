import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { retry } from 'next-test-utils'

describe('jsconfig.json baseurl', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  describe('default behavior', () => {
    it('should render the page', async () => {
      const $ = await next.render$('/hello')
      expect($('body').text()).toMatch(/World/)
    })

    // Integration ran this under `launchApp` only. e2e splits dev vs `next start` jobs, so
    // `it.skip` when !isNextDev is correct: the module-not-found overlay is dev-only; production
    // jobs still cover `should trace correctly` under `should build` below.
    ;(isNextDev ? it : it.skip)(
      'should have correct module not found error',
      async () => {
        const contents = await next.readFile('pages/hello.js')
        try {
          await next.patchFile(
            'pages/hello.js',
            contents.replace('components/world', 'components/worldd')
          )

          await retry(async () => {
            await next.render('/hello').catch(() => {})
            const strippedOutput = stripAnsi(next.cliOutput)
            expect(strippedOutput).toMatch(
              /Module not found: Can't resolve 'components\/worldd'/
            )
          })
        } finally {
          await next.patchFile('pages/hello.js', contents)
        }
      }
    )
  })
  ;(isNextStart ? describe : describe.skip)('should build', () => {
    it('should trace correctly', async () => {
      const helloTrace = JSON.parse(
        await next.readFile('.next/server/pages/hello.js.nft.json')
      )
      expect(
        helloTrace.files.some((file: string) =>
          file.includes('components/world.js')
        )
      ).toBe(false)
      expect(
        helloTrace.files.some((file: string) => file.includes('react/index.js'))
      ).toBe(true)
    })
  })
})
