import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-dir edge SSR',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle edge only routes', async () => {
      const appHtml = await next.render('/app-edge')
      expect(appHtml).toContain('<p>Edge!</p>')

      const pageHtml = await next.render('/pages-edge')
      expect(pageHtml).toContain('<p>pages-edge-ssr</p>')
    })

    it('should retrieve cookies in a server component in the edge runtime', async () => {
      const res = await next.fetch('/edge-apis/cookies')
      expect(await res.text()).toInclude('Hello')
    })

    if ((globalThis as any).isNextDev) {
      it('should resolve module without error in edge runtime', async () => {
        const logs = []
        next.on('stderr', (log) => {
          logs.push(log)
        })
        await next.render('app-edge')
        expect(
          logs.some((log) => log.includes(`Attempted import error:`))
        ).toBe(false)
      })

      it('should handle edge rsc hmr', async () => {
        const pageFile = 'app/app-edge/page.tsx'
        const content = await next.readFile(pageFile)

        // Update rendered content
        const updatedContent = content.replace('Edge!', 'edge-hmr')
        await next.patchFile(pageFile, updatedContent)
        await check(async () => {
          const html = await next.render('/app-edge')
          return html
        }, /edge-hmr/)

        // Revert
        await next.patchFile(pageFile, content)
        await check(async () => {
          const html = await next.render('/app-edge')
          return html
        }, /Edge!/)
      })
    } else {
      // Production tests
      it('should generate matchers correctly in middleware manifest', async () => {
        const manifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )
        expect(manifest.functions['/(group)/group/page'].matchers).toEqual([
          {
            regexp: '^/group$',
          },
        ])
      })
    }
  }
)
