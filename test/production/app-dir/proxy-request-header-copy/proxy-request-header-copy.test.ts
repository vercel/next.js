import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// To forward a trace context to the request behind the proxy, Next.js keeps a
// copy of the request headers as the proxy received them. Without a trace
// context nothing is forwarded, so the headers of every request must not be
// copied for it. The forwarding itself is covered by
// `test/e2e/app-dir/otel-middleware-trace`.
describe('proxy-request-header-copy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()
  })

  it('should not copy the request headers when there is no trace context', async () => {
    const { stdout } = await execa(process.execPath, ['invoke-proxy.js'], {
      cwd: next.testDir,
      stderr: 'inherit',
    })

    expect(JSON.parse(stdout.trim().split('\n').pop()!)).toEqual({
      status: 200,
      body: { requestHeadersCopied: false, forwarded: '203.0.113.7' },
    })
  })
})
