import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('client-reference-side-effects', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('side effect behavior when only importing', async () => {
    const browser = await next.browser('/imported')

    expect(await browser.elementByCss('body').text()).toContain('Server')

    let client = await browser.eval('window.client')
    let client_sideeffect_reexport = await browser.eval(
      'window.client_sideeffect_reexport'
    )
    let client_sideeffect_only = await browser.eval(
      'window.client_sideeffect_only'
    )

    // No client references are rendered, so nothing is executed.
    expect(client).toBeUndefined()
    expect(client_sideeffect_reexport).toBeUndefined()
    expect(client_sideeffect_only).toBeUndefined()
  })

  it('side effect behavior when rendering', async () => {
    const browser = await next.browser('/rendered')

    const body = await browser.elementByCss('body').text()
    expect(body).toContain('Server')
    expect(body).toContain('client component')

    let client = await browser.eval('window.client')
    let client_sideeffect_reexport = await browser.eval(
      'window.client_sideeffect_reexport'
    )
    let client_sideeffect_only = await browser.eval(
      'window.client_sideeffect_only'
    )

    expect(client).toBeTrue()
    expect(client_sideeffect_reexport).toBeTrue()
    if (isTurbopack) {
      expect(client_sideeffect_only).toBeUndefined()
    } else {
      // Webpack eagerly initializes all client reference modules once at least one of them is
      // rendered.
      expect(client_sideeffect_only).toBeTrue()
    }
  })
})
