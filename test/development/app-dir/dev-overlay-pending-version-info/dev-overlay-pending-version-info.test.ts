import { nextTestSetup, type Playwright } from 'e2e-utils'
import { getRedboxDescription, retry, waitForRedbox } from 'next-test-utils'

// The fixture's next.config.js makes the dev server's npm registry request
// (used for the version staleness indicator) hang until the test creates the
// `release-registry` marker file.

function getVersionStatus(browser: Playwright) {
  return browser
    .waitForElementByCss('.nextjs-container-build-error-version-status')
    .text()
}

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
  'dev-overlay-pending-version-info ($router)',
  ({ pathname, file, content }) => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('shows build errors while the registry request is pending and updates the version once it resolves', async () => {
      const browser = await next.browser(pathname)
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
      expect(await getVersionStatus(browser)).toContain('(unknown)')

      await next.patchFile('release-registry', '')

      await retry(async () => {
        expect(await getVersionStatus(browser)).toContain('(outdated)')
      }, 10_000)

      // A late version update must not clear the current build error.
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toBe(
        "Module not found: Can't resolve 'does-not-exist'"
      )
    })
  }
)
