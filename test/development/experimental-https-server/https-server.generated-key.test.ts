import { nextTestSetup } from 'e2e-utils'
import https from 'https'
import { renderViaHTTP } from 'next-test-utils'

describe('experimental-https-server (generated certificate)', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'pnpm next dev --experimental-https',
    skipStart: !process.env.NEXT_TEST_CI,
  })
  if (skipped) return

  if (!process.env.NEXT_TEST_CI) {
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

  it('should successfully reuse generated certificates', async () => {
    await next.stop()
    await next.start()
    expect(next.url).toInclude('https://')
    expect(next.cliOutput).toContain(
      'Using already generated self signed certificate'
    )
  })
})
