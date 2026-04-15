import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { retry } from 'next-test-utils'

describe('jsconfig.json baseurl', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page', async () => {
    const $ = await next.render$('/hello')
    expect($('body').text()).toMatch(/World/)
  })

  it('should have correct module not found error', async () => {
    if (!isNextDev) return

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
  })

  it('should trace correctly', async () => {
    if (isNextDev) return

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
