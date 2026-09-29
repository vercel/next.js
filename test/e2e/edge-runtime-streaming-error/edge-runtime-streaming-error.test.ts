import stripAnsi from 'next/dist/compiled/strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

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

    // Vercel consumes the stream in its runtime; locally it is piped to a Node
    // response, which reports the invalid chunk differently.
    const expectedError = (await gate((c) => c.deploy))
      ? /TypeError: This ReadableStream did not return bytes\./
      : /The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received type boolean/

    // Runtime log delivery can lag behind the response.
    await retry(() => {
      expect(stripAnsi(next.cliOutput)).toMatch(expectedError)
    }, 30_000)
    expect(stripAnsi(next.cliOutput)).not.toContain('webpack-internal:')
  })
})
