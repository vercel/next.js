import { nextTestSetup, isNextDev } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxHeader,
  getDeploymentId,
  retry,
} from 'next-test-utils'

describe('Image Component basePath Tests', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    // Image URL assertions construct expected URLs via
    // `getDeploymentId(next.testDir, ...)`, which reads the local
    // `.next/required-server-files.json`. In deploy mode that file lives on
    // Vercel's infrastructure (not on disk locally), so the constructed
    // expected URL omits the `&dpl=...` query that Vercel injects at
    // runtime. The assertions are about local-build URL shape, not deploy
    // CDN URLs, so skip in deploy.
    skipDeployment: true,
  })
  if (skipped) return

  let dpl: string
  beforeAll(() => {
    dpl = getDeploymentId(next.testDir, isNextDev).getDeploymentIdQuery(true)
  })

  async function getImageUrls(browser) {
    return await Promise.all(
      (await browser.elementsByCss('img')).map(async (link) =>
        new URL(await link.getAttribute('src'), next.url).toString()
      )
    )
  }

  async function getComputed(browser, id, prop) {
    const val = await browser.eval(`document.getElementById('${id}').${prop}`)
    if (typeof val === 'number') {
      return val
    }
    if (typeof val === 'string') {
      const v = parseInt(val, 10)
      if (isNaN(v)) {
        return val
      }
      return v
    }
    return null
  }

  function getRatio(width, height) {
    return height / width
  }

  it('should load the images', async () => {
    const browser = await next.browser('/docs')

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).not.toBe(0)
    })

    expect(await getImageUrls(browser)).toContain(
      `${next.url}/docs/_next/image?url=%2Fdocs%2Ftest.jpg&w=828&q=75${dpl}`
    )
  })

  it('should update the image on src change', async () => {
    const browser = await next.browser('/docs/update')

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("update-image").src`
      )
      expect(src).toMatch(/test\.jpg/)
    })

    await browser.eval(`document.getElementById("toggle").click()`)

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("update-image").src`
      )
      expect(src).toMatch(/test\.png/)
    })
  })

  it('should work when using flexbox', async () => {
    const browser = await next.browser('/docs/flex')
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').width`
      )
      expect(result).not.toBe(0)
    })
  })

  if (isNextDev) {
    it('should show missing src error', async () => {
      const browser = await next.browser('/docs/missing-src')

      await waitForNoRedbox(browser)

      await retry(async () => {
        const logs = (await browser.log()).map((log) => log.message).join('\n')
        expect(logs).toMatch(/Image is missing required "src" property/gm)
      })
    })

    it('should show invalid src error', async () => {
      const browser = await next.browser('/docs/invalid-src')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname "google.com" is not configured under images in your `next.config.js`'
      )
    })

    it('should show invalid src error when protocol-relative', async () => {
      const browser = await next.browser('/docs/invalid-src-proto-relative')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Failed to parse src "//assets.example.com/img.jpg" on `next/image`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)'
      )
    })
  }

  it('should correctly ignore prose styles', async () => {
    const browser = await next.browser('/docs/prose')

    const id = 'prose-image'

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById(${JSON.stringify(id)}).naturalWidth`
      )
      expect(result).toBeGreaterThan(0)
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const computedWidth = await getComputed(browser, id, 'width')
    const computedHeight = await getComputed(browser, id, 'height')
    expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(1, 1)
  })
})
