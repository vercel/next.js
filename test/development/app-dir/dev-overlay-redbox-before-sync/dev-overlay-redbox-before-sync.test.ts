import { nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, waitForRedbox } from 'next-test-utils'

describe.each([
  {
    router: 'app router',
    pathname: '/',
    file: 'app/page.tsx',
    content: 'hello world',
  },
  {
    router: 'pages router',
    pathname: '/pages-router',
    file: 'pages/pages-router.tsx',
    content: 'hello pages',
  },
])(
  'dev-overlay-redbox-before-sync ($router)',
  ({ pathname, file, content }) => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('shows build errors before the HMR sync message arrives', async () => {
      const browser = await next.browser(pathname, {
        async beforePageLoad(page) {
          // Withhold the `sync` message, e.g. as if the server were still waiting
          // for slow data, so the dev overlay never learns the indicator state.
          await page.routeWebSocket(/\/_next\/hmr/, (clientSocket) => {
            const serverSocket = clientSocket.connectToServer()
            serverSocket.onMessage((message) => {
              if (
                typeof message === 'string' &&
                JSON.parse(message).type === 'sync'
              ) {
                return
              }
              clientSocket.send(message)
            })
            clientSocket.onMessage((message) => serverSocket.send(message))
          })
        },
      })
      expect(await browser.elementByCss('p').text()).toBe(content)

      await next.patchFile(file, (source) =>
        source!.replace(
          'export default function Page',
          "import 'does-not-exist'\n\nexport default function Page"
        )
      )

      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toBe(
        "Module not found: Can't resolve 'does-not-exist'"
      )
      // The indicator is still hidden until its state is known.
      expect(await browser.locateDevToolsIndicator().count()).toBe(0)
    })
  }
)
