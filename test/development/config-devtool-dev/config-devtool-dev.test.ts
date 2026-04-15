import { nextTestSetup } from 'e2e-utils'
import { retry, waitForRedbox, getRedboxSource } from 'next-test-utils'

// Webpack specific config test.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'devtool set in development mode in next config',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should warn and revert when a devtool is set in development mode', async () => {
      await retry(async () => {
        expect(next.cliOutput).toMatch(/Reverting webpack devtool to /)
      })

      const browser = await next.browser('/')
      await waitForRedbox(browser)
      if (process.platform !== 'win32') {
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "pages/index.js (5:11) @ Index.useEffect

            3 | export default function Index(props) {
            4 |   useEffect(() => {
          > 5 |     throw new Error('this should render')
              |           ^
            6 |   }, [])
            7 |   return <div>Index Page</div>
            8 | }"
        `)
      }
      await browser.close()
    })
  }
)
