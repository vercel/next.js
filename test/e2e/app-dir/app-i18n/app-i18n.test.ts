import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

createNextDescribe(
  'app-i18n',
  {
    files: __dirname,
  },
  ({ next }) => {
    async function testLocale(lang: string) {
      const res = await fetchViaHTTP(next.url, `/${lang}/another`)
      const html = await res.text()
      expect(html).toContain(`Another page. Lang: <!-- -->${lang}`)
    }

    it('should export the dynamic [lang] correctly', async () => {
      await testLocale('en')
      await testLocale('id')
    })

    it('returns 404 on missing locale', async () => {
      const res = await fetchViaHTTP(next.url, `/my/another`)
      expect(res.status).toBe(404)
    })
  }
)
