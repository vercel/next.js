import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'node:path'

describe('deployment-id-handling disabled', () => {
  const deploymentId = Date.now() + ''
  const { next } = nextTestSetup({
    files: join(__dirname, 'app'),
    env: {
      COOKIE_SKEW: '1',
      NEXT_DEPLOYMENT_ID: 'thankyounext',
    },
  })

  it('should set set-cookie header correctly', async () => {
    const res = await next.fetch('/')
    expect(res.headers.get('set-cookie')).toBe(
      '__vdpl=thankyounext; Path=/; HttpOnly'
    )
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
