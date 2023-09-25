import { createNextDescribe } from 'e2e-utils'
import https from 'https'
import { renderViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'

createNextDescribe(
  'experimental-https-server (generated certificate)',
  {
    files: __dirname,
    startCommand: `yarn next ${
      shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
    } --experimental-https`,
    skipStart: !process.env.CI,
  },
  ({ next }) => {
    if (!process.env.CI) {
      console.warn('only runs on CI as it requires administrator privileges')
      it('only runs on CI as it requires administrator privileges', () => {})
      return
    }

    const agent = new https.Agent({
      rejectUnauthorized: false,
    })

    it('should successfully load the app in app dir', async () => {
      expect(next.url).toInclude('https://')
      const html = await renderViaHTTP(next.url, '/1', undefined, { agent })
      expect(html).toContain('Hello from App')
    })

    it('should successfully load the app in pages dir', async () => {
      expect(next.url).toInclude('https://')
      const html = await renderViaHTTP(next.url, '/2', undefined, { agent })
      expect(html).toContain('Hello from Pages')
    })
  }
)
