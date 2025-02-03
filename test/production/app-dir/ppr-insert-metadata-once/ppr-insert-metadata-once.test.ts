import { nextTestSetup } from 'e2e-utils'

describe('ppr-insert-metadata-once', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only has one description meta inserted', async () => {
    const $ = await next.render$('/')
    expect($('head meta[name="description"]').length).toBe(1)

    const browser = await next.browser('/')
    expect(
      (await browser.elementsByCss('head meta[name="description"]')).length
    ).toBe(1)
  })
})
