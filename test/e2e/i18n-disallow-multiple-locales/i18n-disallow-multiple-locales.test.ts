import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

const config = require('./next.config')

async function verify(res, locale) {
  expect(res.status).toBe(200)

  // Verify that we loaded the right page and the locale is correct.
  const html = await res.text()
  const $ = cheerio.load(html)
  expect($('#page').text()).toBe('index page')
  expect($('#router-locale').text()).toBe(locale)
}

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// TODO: re-enable after this behavior is corrected
// @force-gate !deploy
describe('i18n-disallow-multiple-locales', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should verify the default locale works', async () => {
    const res = await next.fetch('/', { redirect: 'manual' })

    await verify(res, config.i18n.defaultLocale)
  })

  it.each(config.i18n.locales)('/%s should 200', async (locale) => {
    const res = await next.fetch(`/${locale}`, { redirect: 'manual' })

    await verify(res, locale)
  })

  it.each(
    config.i18n.locales.reduce((locales, firstLocale) => {
      for (const secondLocale of config.i18n.locales) {
        locales.push([firstLocale, secondLocale])
      }

      return locales
    }, [])
  )('/%s/%s should 404', async (firstLocale, secondLocale) => {
    // Ensure that the double locale does not work.
    const res = await next.fetch(`/${firstLocale}/${secondLocale}`, {
      redirect: 'manual',
    })

    expect(res.status).toBe(404)
  })
})
