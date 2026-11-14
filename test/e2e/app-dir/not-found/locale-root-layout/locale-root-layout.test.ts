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

  it('should preserve locale param for other dynamic locales and include noindex', async () => {
    const res = await next.fetch('/fr/another-missing-page')
    expect(res.status).toBe(404)
    const rawHtml = await res.text()
    expect(rawHtml).toMatch(/<html[^>]*\blang="fr"/)
    expect(rawHtml).toMatch(/<meta[^>]*name="robots"[^>]*content="noindex"/)
    const markup = rawHtml.replace(/<script\b[\s\S]*?<\/script>/g, '')
    expect(markup).toContain('Localized Not Found')
  })
})
