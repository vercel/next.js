import { nextTestSetup } from 'e2e-utils'
import https from 'https'
import { renderViaHTTP } from 'next-test-utils'

describe('experimental-https-server (provided certificate)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `pnpm next dev --experimental-https --experimental-https-key ./certificates/localhost-key.pem --experimental-https-cert ./certificates/localhost.pem`,
  })
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
})
