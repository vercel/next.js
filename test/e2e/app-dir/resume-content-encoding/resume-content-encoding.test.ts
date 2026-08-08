import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import type { NextAdapter } from 'next'

type BuildComplete = Parameters<NextAdapter['onBuildComplete']>[0]

describe('resume-content-encoding', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || skipped) {
    it.skip('only testable in production', () => {})
    return
  }

  if (!isNextDeploy) {
    it('should publish resumable PPR metadata to the adapter', async () => {
      const { outputs }: BuildComplete = await next.readJSON(
        'build-complete.json'
      )

      const prerender = outputs.prerenders.find(
        (output) => output.pathname === '/'
      )

      expect(prerender).toMatchObject({
        pathname: '/',
        pprChain: {
          headers: {
            'next-resume': '1',
          },
        },
        fallback: {
          filePath: expect.any(String),
          postponedState: expect.any(String),
        },
      })

      expect(prerender?.fallback.postponedState.length).toBeGreaterThan(0)
    })
  }

  it('should serve the PPR shell and resumed dynamic content', async () => {
    const response = await next.fetch('/', {
      headers: { cookie: 'demo=test-value' },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('static shell')
    expect(html).toContain('test-value')
  })
})
