import { nextTestSetup } from 'e2e-utils'

describe('adapter-route-i18n', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    { prefix: '', locale: 'en' },
    { prefix: '/fr', locale: 'fr' },
  ])(
    'renders the $locale locale with a base path',
    async ({ prefix, locale }) => {
      const browser = await next.browser(
        `/base${prefix}/legacy/one?term=kept`,
        { permissions: [] }
      )
      expect(await browser.elementById(`${locale}-one`).text()).toBe(
        `${locale}:one`
      )
      expect(JSON.parse(await browser.elementById('query').text())).toEqual({
        slug: 'one',
        term: 'kept',
      })
    }
  )

  it('navigates to an explicit locale without reloading the document', async () => {
    const browser = await next.browser('/base/legacy/one', {
      permissions: [],
    })
    await browser.eval('window.__testDocument = "retained"')
    await browser.elementById('next-page').click()
    expect(await browser.elementById('fr-two').text()).toBe('fr:two')
    expect(JSON.parse(await browser.elementById('query').text())).toEqual({
      slug: 'two',
      term: 'next',
    })
    expect(new URL(await browser.url()).pathname).toBe('/base/fr/legacy/two')
    expect(await browser.eval('window.__testDocument')).toBe('retained')
  })
})
