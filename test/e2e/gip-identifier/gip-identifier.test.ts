import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
describe('gip identifiers', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  const getNextData = async () => {
    const html = await next.render('/')
    const $ = cheerio.load(html)
    return JSON.parse($('#__NEXT_DATA__').text())
  }

  it('should not have gip or appGip in NEXT_DATA for page without getInitialProps', async () => {
    const data = await getNextData()
    expect(data.gip).toBe(undefined)
    expect(data.appGip).toBe(undefined)
  })

  if (isNextDev) {
    it('should have gip in NEXT_DATA for page with getInitialProps', async () => {
      await next.patchFile(
        'pages/index.js',
        `
        const Page = () => 'hi'
        Page.getInitialProps = () => ({ hello: 'world' })
        export default Page
      `
      )
      await retry(async () => {
        const data = await getNextData()
        expect(data.gip).toBe(true)
      })
    })

    it('should have gip and appGip in NEXT_DATA for page with getInitialProps and _app with getInitialProps', async () => {
      await next.patchFile(
        'pages/_app.js',
        `
        const App = ({ Component, pageProps }) => <Component {...pageProps} />
        App.getInitialProps = async (ctx) => {
          let pageProps = {}
          if (ctx.Component.getInitialProps) {
            pageProps = await ctx.Component.getInitialProps(ctx.ctx)
          }
          return { pageProps }
        }
        export default App
      `
      )
      await retry(async () => {
        const data = await getNextData()
        expect(data.gip).toBe(true)
        expect(data.appGip).toBe(true)
      })
    })

    it('should only have appGip in NEXT_DATA for page without getInitialProps and _app with getInitialProps', async () => {
      await next.patchFile('pages/index.js', `export default () => 'hi'\n`)
      await retry(async () => {
        const data = await getNextData()
        expect(data.gip).toBe(undefined)
        expect(data.appGip).toBe(true)
      })
    })
  }
})
