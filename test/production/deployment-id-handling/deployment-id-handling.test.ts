import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'node:path'

describe.each(['NEXT_DEPLOYMENT_ID', 'CUSTOM_DEPLOYMENT_ID'])(
  'deployment-id-handling enabled with %s',
  (envKey) => {
    const deploymentId = Date.now() + ''
    const { next } = nextTestSetup({
      files: join(__dirname, 'app'),
      env: {
        [envKey]: deploymentId,
      },
    })

    it.each([
      { urlPath: '/' },
      { urlPath: '/pages-edge' },
      { urlPath: '/from-app' },
      { urlPath: '/from-app/edge' },
    ])(
      'should append dpl query to all assets correctly for $urlPath',
      async ({ urlPath }) => {
        const $ = await next.render$(urlPath)

        expect($('#deploymentId').text()).toBe(deploymentId)

        const scripts = Array.from($('script'))
        expect(scripts.length).toBeGreaterThan(0)

        for (const script of scripts) {
          if (script.attribs.src) {
            expect(script.attribs.src).toContain('dpl=' + deploymentId)
          }
        }

        const links = Array.from($('link'))
        expect(links.length).toBeGreaterThan(0)

        for (const link of links) {
          if (link.attribs.href && link.attribs.rel !== 'expect') {
            if (link.attribs.as === 'font') {
              expect(link.attribs.href).not.toContain('dpl=' + deploymentId)
            } else {
              expect(link.attribs.href).toContain('dpl=' + deploymentId)
            }
          }
        }

        const browser = await next.browser(urlPath)
        const requests = []

        browser.on('request', (req) => {
          if (req.url().includes('/_next/static')) {
            requests.push(req.url())
          }
        })

        await browser.elementByCss('#dynamic-import').click()

        await retry(() => expect(requests).not.toBeEmpty())

        try {
          expect(
            requests.every((item) => item.includes('dpl=' + deploymentId))
          ).toBe(true)
        } finally {
          require('console').error('requests', requests)
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
            const headers = await req.allHeaders()
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
            const headers = await req.allHeaders()
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

      expect(
        rscHeaders.every(
          (headers) => headers['x-deployment-id'] === deploymentId
        )
      ).toBe(true)
    })
  }
)

describe('deployment-id-handling disabled', () => {
  const deploymentId = Date.now() + ''
  const { next } = nextTestSetup({
    files: join(__dirname, 'app'),
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
          if (link.attribs.as === 'font') {
            expect(link.attribs.href).not.toContain('dpl=' + deploymentId)
          } else {
            expect(link.attribs.href).not.toContain('dpl=' + deploymentId)
          }
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
        expect(
          requests.every((item) => !item.includes('dpl=' + deploymentId))
        ).toBe(true)
      } finally {
        require('console').error('requests', requests)
      }
    }
  )
})
