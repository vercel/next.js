import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'
import fs from 'fs'
import path from 'path'

const configPath = path.join(__dirname, 'next.config.js')

describe('rsc-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should get 307 status code for document request', async () => {
    const response = await fetchViaHTTP(next.url, '/origin', undefined, {
      redirect: 'manual',
    })
    expect(response.status).toBe(307)
  })

  it('should get 200 status code for rsc request', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/origin?${NEXT_RSC_UNION_QUERY}`,
      undefined,
      {
        redirect: 'manual',
        headers: {
          rsc: '1',
        },
      }
    )
    expect(response.status).toBe(200)
  })
})

// TODO: these tests aren't currently run at all during testing
if (process.env.NODE_ENV === 'production') {
  describe.each([
    { cacheComponents: true, segmentCache: true },
    { cacheComponents: true, segmentCache: false },
    { cacheComponents: false, segmentCache: true },
    { cacheComponents: false, segmentCache: false },
  ] as const)(
    'rsc-redirect /old-about -> /about (cacheComponents: $cacheComponents, segmentCache: $segmentCache)',
    ({ cacheComponents, segmentCache }) => {
      beforeAll(() => {
        // Write next.config.js with the current flags
        fs.writeFileSync(
          configPath,
          `module.exports = { experimental: { cacheComponents: ${cacheComponents}, clientSegmentCache: ${segmentCache} } }\n`
        )
      })

      afterAll(() => {
        // Clean up config file
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
      })

      const { next } = nextTestSetup({
        files: __dirname,
      })

      it('uses prefetched, redirected URL in the navigation, as opposed to the href in the link', async () => {
        const networkStatuses: number[] = []
        const browser = await next.browser('/', {
          beforePageLoad: (page) => {
            page.on('response', (response) => {
              networkStatuses.push(response.status())
            })
          },
        })
        await browser.waitForIdleNetwork()
        // Clear network statuses before clicking to only capture responses from the click
        networkStatuses.length = 0
        await browser.elementByCss('a[href="/old-about"]').click()
        await browser.waitForElementByCss('#about-page')
        expect(networkStatuses).toContain(200)
        expect(networkStatuses).not.toContain(307)
      })
    }
  )
}
