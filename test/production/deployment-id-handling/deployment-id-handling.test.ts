import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'node:path'

describe.each([
  ['NEXT_DEPLOYMENT_ID', ''],
  ['CUSTOM_DEPLOYMENT_ID', ''],
  ['NEXT_DEPLOYMENT_ID', ' and runtimeServerDeploymentId'],
  ['IMMUTABLE_ASSET_TOKEN', ''],
])(
  'deployment-id-handling enabled with %s%s',
  (envKey, runtimeServerDeploymentId) => {
    if (envKey === 'IMMUTABLE_ASSET_TOKEN' && !process.env.IS_TURBOPACK_TEST) {
      it.skip('skip for webpack', () => {})
      return
    }

    const deploymentId = Date.now() + ''
    const immutableAssetToken =
      envKey === 'IMMUTABLE_ASSET_TOKEN' ? `imm-${deploymentId}` : deploymentId

    const { next } = nextTestSetup({
      files: join(__dirname, 'app'),
      env: {
        [envKey]: deploymentId,
        RUNTIME_SERVER_DEPLOYMENT_ID: runtimeServerDeploymentId
          ? '1'
          : undefined,
      },
      disableAutoSkewProtection: true,
    })

    const tokenForRequest = (url) => {
      return url.includes('_next/static/chunks') ||
        url.includes('_next/static/media')
        ? // Turbopack-emitted chunks
          immutableAssetToken
        : // e.g. _next/static/build-id/_ssgManifest.js
          deploymentId
    }
    const validateTokenForRequest = (url) => {
      expect(url).toContain('dpl=' + tokenForRequest(url))
    }

    it.each([
      { urlPath: '/' },
      { urlPath: '/pages-edge' },
      { urlPath: '/from-app' },
      { urlPath: '/from-app/edge' },
    ])(
      'should append dpl query to all assets correctly for $urlPath',
      async ({ urlPath }) => {
        // Validate SSR response
        const $ = await next.render$(urlPath)

        expect($('#deploymentId').text()).toBe(deploymentId)

        const scripts = Array.from($('script'))
        expect(scripts.length).toBeGreaterThan(0)

        for (const script of scripts) {
          if (script.attribs.src) {
            validateTokenForRequest(script.attribs.src)
          }
        }

        const links = Array.from($('link'))
        expect(links.length).toBeGreaterThan(0)

        for (const link of links) {
          if (link.attribs.href && link.attribs.rel !== 'expect') {
            validateTokenForRequest(link.attribs.href)
          }
        }

        // Validate all requests ever performed by a browser

        const clientRequests = []

        const browser = await next.browser(urlPath, {
          beforePageLoad(page) {
            page.on('request', async (req) => {
              // TODO this currently exclude _next/image
              if (req.url().includes('/_next/static')) {
                clientRequests.push(req.url())
              }
            })
          },
        })

        const dynamicImportRequests = []
        browser.on('request', (req) => {
          if (req.url().includes('/_next/static')) {
            dynamicImportRequests.push(req.url())
          }
        })
        await browser.elementByCss('#dynamic-import').click()
        await retry(() => expect(dynamicImportRequests).not.toBeEmpty())

        try {
          expect(dynamicImportRequests).toSatisfyAll((item) =>
            item.includes('dpl=' + tokenForRequest(item))
          )
        } finally {
          require('console').error(
            'dynamicImportRequests',
            dynamicImportRequests
          )
        }

        try {
          expect(clientRequests).toSatisfyAll((item) =>
            item.includes('dpl=' + tokenForRequest(item))
          )
        } finally {
          require('console').error('clientRequests', clientRequests)
        }
      }
    )

    it.each([{ pathname: '/api/hello' }, { pathname: '/api/hello-app' }])(
      'should have deployment id env available',
      async ({ pathname }) => {
        const res = await next.fetch(pathname)

        expect(await res.json()).toEqual({
          deploymentId,
        })
      }
    )

    it('should contain deployment id in prefetch request', async () => {
      const dataHeaders = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
            const headers = req.headers()
            if (headers['x-nextjs-data']) {
              dataHeaders.push(headers)
            }
          })
        },
      })

      await browser.elementByCss('#edge-link').click()

      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('hello pages edge')
        expect(await browser.url()).toContain('/pages-edge')
        expect(dataHeaders.length).toBeGreaterThan(0)
      })

      expect(
        dataHeaders.every(
          (headers) => headers['x-deployment-id'] === deploymentId
        )
      ).toBe(true)
    })

    it('should contain deployment id in RSC payload request headers', async () => {
      const rscHeaders = []
      const browser = await next.browser('/from-app', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
            const headers = req.headers()
            if (headers['rsc']) {
              rscHeaders.push(headers)
            }
          })
        },
      })

      await browser.elementByCss('#other-app').click()

      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('other app')
        expect(await browser.url()).toContain('/other-app')
        expect(rscHeaders.length).toBeGreaterThan(0)
      })

      expect(rscHeaders).toSatisfyAll(
        (headers) => headers['x-deployment-id'] === deploymentId
      )
    })
  }
)

describe('deployment-id-handling disabled', () => {
  const deploymentId = Date.now() + ''
  const { next } = nextTestSetup({
    files: join(__dirname, 'app'),
    disableAutoSkewProtection: true,
  })
  it.each([
    { urlPath: '/' },
    { urlPath: '/pages-edge' },
    { urlPath: '/from-app' },
    { urlPath: '/from-app/edge' },
  ])(
    'should not append dpl query to all assets for $urlPath',
    async ({ urlPath }) => {
      const $ = await next.render$(urlPath)

      expect($('#deploymentId').text()).not.toBe(deploymentId)

      const scripts = Array.from($('script'))
      expect(scripts.length).toBeGreaterThan(0)

      for (const script of scripts) {
        if (script.attribs.src) {
          expect(script.attribs.src).not.toContain('dpl=' + deploymentId)
        }
      }

      const links = Array.from($('link'))
      expect(links.length).toBeGreaterThan(0)

      for (const link of links) {
        if (link.attribs.href) {
          expect(link.attribs.href).not.toContain('dpl=' + deploymentId)
        }
      }

      const browser = await next.browser(urlPath)
      const requests = []

      browser.on('request', (req) => {
        requests.push(req.url())
      })

      await browser.elementByCss('#dynamic-import').click()

      await retry(() => expect(requests).not.toBeEmpty())

      try {
        expect(requests).toSatisfyAll(
          (item) => !item.includes('dpl=' + deploymentId)
        )
      } finally {
        require('console').error('requests', requests)
      }
    }
  )
})
