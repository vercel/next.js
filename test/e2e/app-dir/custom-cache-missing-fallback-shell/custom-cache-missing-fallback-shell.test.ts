import { nextTestSetup } from 'e2e-utils'

describe('custom-cache-missing-fallback-shell', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  it('regenerates missing fallback shell at request time without NEXT_STATIC_GEN_BAILOUT', async () => {
    // Generated static route
    const resA = await next.fetch('/items/a')
    expect(resA.status).toBe(200)
    expect(await resA.text()).toContain('Item a')

    // Dynamic non-generated route (cold fallback shell)
    const resB1 = await next.fetch('/items/b')
    expect(resB1.status).toBe(200)
    expect(await resB1.text()).toContain('Item b')

    // Repeated request to dynamic route (hitting newly cached shell)
    const resB2 = await next.fetch('/items/b')
    expect(resB2.status).toBe(200)
    expect(await resB2.text()).toContain('Item b')

    expect(next.cliOutput).not.toContain('NEXT_STATIC_GEN_BAILOUT')
  })
})
