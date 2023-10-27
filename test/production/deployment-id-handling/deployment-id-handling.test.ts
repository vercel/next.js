import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'node:path'

const deploymentId = Date.now() + ''

createNextDescribe(
  'deployment-id-handling enabled',
  {
    files: join(__dirname, 'app'),
    env: {
      NEXT_DEPLOYMENT_ID: deploymentId,
      USE_DEPLOYMENT_ID: '1',
    },
  },
  ({ next }) => {
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
          if (link.attribs.href) {
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
          requests.push(req.url())
        })

        await browser.elementByCss('#dynamic-import').click()

        await check(
          () => (requests.length > 0 ? 'success' : JSON.stringify(requests)),
          'success'
        )

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
  }
)

createNextDescribe(
  'deployment-id-handling disabled',
  {
    files: join(__dirname, 'app'),
    env: {
      NEXT_DEPLOYMENT_ID: deploymentId,
    },
  },
  ({ next }) => {
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

        await check(
          () => (requests.length > 0 ? 'success' : JSON.stringify(requests)),
          'success'
        )

        try {
          expect(
            requests.every((item) => !item.includes('dpl=' + deploymentId))
          ).toBe(true)
        } finally {
          require('console').error('requests', requests)
        }
      }
    )

    it.each([{ pathname: '/api/hello' }, { pathname: '/api/hello-app' }])(
      'should not have deployment id env available',
      async ({ pathname }) => {
        const res = await next.fetch(pathname)

        expect(await res.json()).not.toEqual({
          deploymentId,
        })
      }
    )
  }
)
