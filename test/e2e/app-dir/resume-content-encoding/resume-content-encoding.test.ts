import { nextTestSetup, isNextDeploy } from 'e2e-utils'

describe('resume-content-encoding', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || skipped) {
    it.skip('only testable in production', () => {})
    return
  }

  it('should build with postponed state for PPR resume', async () => {
    if (isNextDeploy) return
    const { postponed } = await next.readJSON('.next/server/app/index.meta')
    expect(postponed).toEqual(expect.any(String))
    expect(postponed.length).toBeGreaterThan(0)
  })

  it('should serve both static shell and dynamic content via PPR resume', async () => {
    const response = await next.fetch('/', {
      headers: { cookie: 'demo=test-value' },
    })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('static shell')
    expect(html).toContain('test-value')
  })
})
