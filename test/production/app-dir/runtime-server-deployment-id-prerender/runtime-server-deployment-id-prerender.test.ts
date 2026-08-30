import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

const BUILD_DEPLOYMENT_ID = 'dpl_aaaaaaaaaaaaaaaa'
const RUNTIME_DEPLOYMENT_ID = 'dpl_bbbbbbbbbbbbbbbb'

describe('runtimeServerDeploymentId prerendered flight payload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    disableAutoSkewProtection: true,
    env: {
      NEXT_DEPLOYMENT_ID: BUILD_DEPLOYMENT_ID,
    },
  })

  beforeAll(async () => {
    const { exitCode } = await next.build()
    // eslint-disable-next-line jest/no-standalone-expect
    expect(exitCode).toBe(0)
    await next.start({
      skipBuild: true,
      env: {
        NEXT_DEPLOYMENT_ID: RUNTIME_DEPLOYMENT_ID,
      },
    })
  })

  it('stamps the runtime deployment id on prerendered HTML (data-dpl-id)', async () => {
    // Before: the build artifact still carries the build-time id.
    const onDisk = await next.readFile('.next/server/app/index.html')
    expect(onDisk).toContain(`data-dpl-id="${BUILD_DEPLOYMENT_ID}"`)

    // After: serving under a different NEXT_DEPLOYMENT_ID rewrites it.
    const html = await next.render('/')

    expect(html).toContain(`data-dpl-id="${RUNTIME_DEPLOYMENT_ID}"`)
    expect(html).not.toContain(`data-dpl-id="${BUILD_DEPLOYMENT_ID}"`)
  })

  it('sends the runtime deployment id on dynamic RSC navigation responses', async () => {
    const res = await next.fetch('/dynamic', {
      headers: {
        RSC: '1',
      },
    })

    expect(res.headers.get('x-nextjs-deployment-id')).toBe(
      RUNTIME_DEPLOYMENT_ID
    )
  })

  it('navigates from a prerendered page to a dynamic page without an MPA reload', async () => {
    const documentRequests: string[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.resourceType() === 'document'
          ) {
            documentRequests.push(request.url())
          }
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#home').text()).toBe(
        'prerendered home'
      )
    })

    const documentsAfterLoad = documentRequests.length
    await browser.elementByCss('#nav-link').click()

    await retry(async () => {
      expect(await browser.elementByCss('#dynamic').text()).toBe('dynamic page')
    })

    expect(documentRequests.length).toBe(documentsAfterLoad)
  })
})
