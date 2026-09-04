import { nextTestSetup } from 'e2e-utils'
import { renderViaRawHTTP } from 'next-test-utils'

describe('experimental-https-server (provided certificate)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `pnpm next dev --experimental-https --experimental-https-key ./certificates/localhost-key.pem --experimental-https-cert ./certificates/localhost.pem`,
  })
  it('should successfully load the app in app dir', async () => {
    expect(next.url).toInclude('https://')
    const html = await renderViaRawHTTP(next.url, '/1', {
      rejectUnauthorized: false,
    })
    expect(html).toContain('Hello from App')
  })

  it('should successfully load the app in pages dir', async () => {
    expect(next.url).toInclude('https://')
    const html = await renderViaRawHTTP(next.url, '/2', {
      rejectUnauthorized: false,
    })
    expect(html).toContain('Hello from Pages')
  })
})
