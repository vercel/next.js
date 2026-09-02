import { nextTestSetup } from 'e2e-utils'

// TODO: Test didn't (or maybe) never ran in CI but it should.
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
// @force-gate !deploy
// @force-gate TODO
describe('app dir - next-image (with https)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `pnpm next dev --experimental-https`,
  })

  it('loads images without any errors', async () => {
    let failCount = 0
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('response', (response) => {
          const url = response.url()
          if (!url.includes('/_next/image')) return

          const status = response.status()

          console.log(`URL: ${url} Status: ${status}`)

          if (!response.ok()) {
            console.log(`Request failed: ${url}`)
            failCount++
          }
        })
      },
    })
    const image = browser.elementByCss('#app-page')
    const src = await image.getAttribute('src')

    if (process.env.IS_TURBOPACK_TEST) {
      expect(src).toMatchInlineSnapshot(
        `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.4813cd24.png&w=828&q=90"`
      )
    } else {
      expect(src).toMatchInlineSnapshot(
        `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90"`
      )
    }

    expect(failCount).toBe(0)
  })
})
