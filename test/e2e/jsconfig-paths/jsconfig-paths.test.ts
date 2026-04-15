import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'

describe('jsconfig paths', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should alias components', async () => {
    const $ = await next.render$('/basic-alias')
    expect($('body').text()).toMatch(/World/)
  })

  it('should resolve the first item in the array first', async () => {
    const $ = await next.render$('/resolve-order')
    expect($('body').text()).toMatch(/Hello from a/)
  })

  it('should resolve the second item as fallback', async () => {
    const $ = await next.render$('/resolve-fallback')
    expect($('body').text()).toMatch(/Hello from only b/)
  })

  it('should resolve a single matching alias', async () => {
    const $ = await next.render$('/single-alias')
    expect($('body').text()).toMatch(/Hello/)
  })

  if (isNextDev) {
    it('should have correct module not found error', async () => {
      const originalContent = await next.readFile('pages/basic-alias.js')

      try {
        await next.patchFile(
          'pages/basic-alias.js',
          originalContent.replace('@c/world', '@c/worldd')
        )

        await retry(async () => {
          await next.render('/basic-alias')
          expect(stripAnsi(next.cliOutput)).toMatch(
            /Module not found: Can't resolve '@c\/worldd'/
          )
        })
      } finally {
        await next.patchFile('pages/basic-alias.js', originalContent)
      }
    })
  }
})
