import stripAnsi from 'next/dist/compiled/strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('edge-runtime-streaming-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    captureRuntimeLogs: true,
  })

  it('logs the error correctly', async () => {
    const res = await next.fetch('/api/test')
    expect(await res.text()).toEqual('hello')
    expect(res.status).toBe(200)

    // Runtime logs arrive over the network, outside `retry()`'s 3s
    // default. 30s is what `check()` gives the one deploy suite that
    // already reads them successfully.
    await retry(() => {
      expect(stripAnsi(next.cliOutput)).toMatch(
        /The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received type boolean/
      )
    }, 30_000)
    expect(stripAnsi(next.cliOutput)).not.toContain('webpack-internal:')
  })
})
