import { nextTestSetup } from 'e2e-utils'

describe('inline script hashes with a resumed shell', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped || isNextDev) return

  it('leaves the resume streaming and the policy untouched', async () => {
    const res = await next.fetch('/ppr')
    const html = await res.text()

    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'self'; script-src 'self'"
    )
    expect(html).toContain('id="dynamic"')
  })
})
