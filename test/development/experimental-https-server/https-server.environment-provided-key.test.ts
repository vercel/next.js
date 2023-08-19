import { createNextDescribe } from 'e2e-utils'
import https from 'https'
import { renderViaHTTP } from 'next-test-utils'

createNextDescribe(
  'experimental-https-server (environment provided certificate)',
  {
    files: __dirname,
    nextConfig: {
      env: {
        EXPERIMENTAL_HTTPS_KEY: './certificates/localhost-key.pem',
        EXPERIMENTAL_HTTPS_CERT: './certificates/localhost.pem',
      },
    },
    startCommand: 'EXPERIMENTALyarn next dev --experimental-https',
  },
  ({ next }) => {
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
