import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
const { i18n } = require('./next.config')

createNextDescribe(
  'i18n-public-support',
  {
    files: __dirname,
    env: {
      // Disable internal header stripping so we can test the invoke output.
      __NEXT_NO_STRIP_INTERNAL_HEADERS: '1',
    },
  },
  ({ next }) => {
    describe('I18n public folder support', () => {
      it.each(i18n.domains)(
        'should return static assets on sub-path',
        async ({ domain, defaultLocale }) => {
          const res = await fetchViaHTTP(next.url, `/${defaultLocale}/test`)
          expect(res.status).toBe(200)
        }
      )
    })
  }
)
