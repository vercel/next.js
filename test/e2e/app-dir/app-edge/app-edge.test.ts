import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app-dir edge SSR', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should handle edge only routes', async () => {
    const appHtml = await next.render('/edge/basic')
    expect(appHtml).toContain('<p>Edge!</p>')

    const pageHtml = await next.render('/pages-edge')
    expect(pageHtml).toContain('<p>pages-edge-ssr</p>')
  })

  it('should retrieve cookies in a server component in the edge runtime', async () => {
    const res = await next.fetch('/edge-apis/cookies')
    expect(await res.text()).toInclude('Hello')
  })

  it('should treat process as object without polyfill in edge runtime', async () => {
    const $ = await next.render$('/edge-apis/process')
    expect(await $('#process').text()).toContain('object')
  })

  it('should handle /index routes correctly', async () => {
    const appHtml = await next.render('/index')
    expect(appHtml).toContain('the /index route')
  })

  if ((globalThis as any).isNextDev) {
    it('should resolve module without error in edge runtime', async () => {
      const logs = []
      next.on('stderr', (log) => {
        logs.push(log)
      })
      await next.render('/app-edge')
      expect(logs.some((log) => log.includes(`Attempted import error:`))).toBe(
        false
      )
    })

    it('should resolve client component without error', async () => {
      const logs = []
      next.on('stderr', (log) => {
        if (!log.includes('experimental edge runtime')) {
          logs.push(log)
        }
      })
      const html = await next.render('/with-client')
      expect(html).toContain('My Button')
      expect(logs).toEqual([])
    })

    it('should handle edge rsc hmr', async () => {
      const pageFile = 'app/edge/basic/page.tsx'
      const content = await next.readFile(pageFile)

      // Update rendered content
      const updatedContent = content.replace('Edge!', 'edge-hmr')
      await next.patchFile(pageFile, updatedContent)
      await check(async () => {
        const html = await next.render('/edge/basic')
        return html
      }, /edge-hmr/)

      // Revert
      await next.patchFile(pageFile, content)
      await check(async () => {
        const html = await next.render('/edge/basic')
        return html
      }, /Edge!/)
    })
  } else {
    // Production tests
    it('should generate matchers correctly in middleware manifest', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/server/middleware-manifest.json')
      )
      if (process.env.IS_TURBOPACK_TEST) {
        expect(manifest.functions['/(group)/group/page'].matchers).toEqual([
          {
            regexp: '^/group(?:/)?$',
            originalSource: '/group',
          },
        ])
      } else {
        expect(manifest.functions['/(group)/group/page'].matchers).toEqual([
          {
            regexp: '^/group$',
            originalSource: '/group',
          },
        ])
      }
    })
  }
})
