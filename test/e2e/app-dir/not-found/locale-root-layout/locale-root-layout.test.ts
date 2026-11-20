import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found - root layout under a dynamic segment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should server render the not-found boundary inside the root layout of the segment', async () => {
    const res = await next.fetch('/pt-BR/definitely-not-a-page')
    expect(res.status).toBe(404)
    const markup = (await res.text()).replace(
      /<script\b[\s\S]*?<\/script>/g,
      ''
    )
    expect(markup).toMatch(/<html[^>]*\blang="pt-BR"/)
    expect(markup).toContain('Localized Not Found')
  })

  it('should use the boundary above a layout that throws notFound()', async () => {
    const res = await next.fetch('/en/shop/item')
    expect(res.status).toBe(404)
    const markup = (await res.text()).replace(
      /<script\b[\s\S]*?<\/script>/g,
      ''
    )
    expect(markup).toMatch(/<html[^>]*\blang="en"/)
    expect(markup).toContain('Localized Not Found')
    expect(markup).not.toContain('Item Not Found')
  })

  it('should keep the error shell when the root layout throws notFound()', async () => {
    const res = await next.fetch('/wp-login.php')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('id="__next_error__"')
  })
})
