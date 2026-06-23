import { nextTestSetup } from 'e2e-utils'
import { NextAdapter } from 'next'
import { retry } from 'next-test-utils'
import { join } from 'node:path'

describe.each([
  ['NEXT_DEPLOYMENT_ID', ''],
  ['CUSTOM_DEPLOYMENT_ID', ''],
  ['NEXT_DEPLOYMENT_ID', ' and runtimeServerDeploymentId'],
  ['NEXT_DEPLOYMENT_ID_IMMUTABLE', ''],
])(
  'deployment-id-handling enabled with %s%s',
  (envKey, runtimeServerDeploymentId) => {
    if (
      envKey === 'NEXT_DEPLOYMENT_ID_IMMUTABLE' &&
      !process.env.IS_TURBOPACK_TEST
    ) {
      it.skip('skip for webpack', () => {})
      return
    }

    const deploymentId = Date.now() + ''
    const immutableAssetToken =
      envKey === 'NEXT_DEPLOYMENT_ID_IMMUTABLE' ? '' : deploymentId

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

    const validateTokenForRequest = (url: string) => {
      const token = url.includes('/_next/static/immutable/')
        ? // Turbopack-emitted chunks
          immutableAssetToken
        : // e.g. /_next/static/build-id/_ssgManifest.js
          deploymentId
      if (token) {
        expect(url).toContain('dpl=' + token)
      } else {
        expect(url).not.toContain('dpl=')
      }
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
          dynamicImportRequests.forEach((item) => validateTokenForRequest(item))
        } finally {
          require('console').error(
            'dynamicImportRequests',
            dynamicImportRequests
          )
        }

        try {
          clientRequests.forEach((item) => validateTokenForRequest(item))
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

    if (envKey === 'NEXT_DEPLOYMENT_ID_IMMUTABLE') {
      it('should emit hashes to adapter', async () => {
        const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
          await next.readJSON('build-complete.json')

        const immutableAssets = outputs.staticFiles.filter(
          (a) =>
            a.pathname.startsWith('/_next/static/') &&
            !(
              a.pathname.endsWith('/_buildManifest.js') ||
              a.pathname.endsWith('/_clientMiddlewareManifest.js') ||
              a.pathname.endsWith('/_ssgManifest.js')
            )
        )
        expect(immutableAssets).not.toBeEmpty()
        expect(immutableAssets).toSatisfyAll(
          (f) =>
            // Should be same hash as in the filename, for better build performance.
            // This check also ensure that we don't accidentally forget to content hash sourcemap
            // files (i.e. 0cz1d0mv5g_q7.js is content hashed, but 0cz1d0mv5g_q7.js.map is not a
            // content hash of itself)..
            f.immutableHash && f.pathname.includes(f.immutableHash.slice(0, 13))
        )
      })
    }
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
