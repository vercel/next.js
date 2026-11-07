import { nextTestSetup } from 'e2e-utils'

describe('static-rsc-regenerated-ppr', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    // Publishing the item edits a data file on disk after the build.
    skipDeployment: true,
  })

  if (skipped || !isNextStart) {
    it('is skipped', () => {})
    return
  }

  it('resumes the dynamic part on navigation after a static redirect regenerates as a partial prerender', async () => {
    await next.patchFile(
      'data/items.json',
      JSON.stringify({ a: { title: 'Item A' }, b: { title: 'Item B' } })
    )
    const res = await next.fetch('/api/revalidate?tag=item-a', {
      method: 'POST',
    })
    expect(res.status).toBe(200)

    const browser = await next.browser('/')
    await browser.elementByCss('#link-a').click()

    expect(await browser.elementByCss('#title').text()).toBe('Item A')
    expect(await browser.elementByCss('#dynamic').text()).toBe('dynamic')
  })
})
