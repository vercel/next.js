import { nextTestSetup } from 'e2e-utils'

describe('explicit-parallel-route-children-legacy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps the legacy missing-children fallback when explicitly disabled', async () => {
    const browser = await next.browser('/named-only/anything')

    // Legacy detection supplies a synthetic children fallback even though this
    // route has only named slots. Rendering that prop produces the not-found UI.
    expect(await browser.elementById('legacy-children-not-found').text()).toBe(
      'legacy children not found'
    )
    expect(await browser.hasElementByCss('#left')).toBe(false)
    expect(await browser.hasElementByCss('#right')).toBe(false)
  })
})
