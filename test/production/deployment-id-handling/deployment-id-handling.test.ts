import { createNextDescribe } from 'e2e-utils'
import { join } from 'node:path'

const deploymentId = Date.now() + ''

createNextDescribe(
  'deployment-id-handling',
  {
    files: join(__dirname, 'app'),
    env: {
      NEXT_DEPLOYMENT_ID: deploymentId,
    },
    nextConfig: {
      experimental: {
        useDeploymentId: true,
      },
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
            expect(link.attribs.href).toContain('dpl=' + deploymentId)
          }
        }
      }
    )
  }
)
