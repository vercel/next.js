import stripAnsi from 'next/dist/compiled/strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This scope asserts the server-side diagnostic from an invalid streaming response.
// Deploy cliOutput contains build logs, not the runtime error being checked.
// @force-gate !deploy
describe('edge-runtime-streaming-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
  })

  it('logs the error correctly', async () => {
    const res = await next.fetch('/api/test')
    expect(await res.text()).toEqual('hello')
    expect(res.status).toBe(200)

    await retry(() => {
      expect(stripAnsi(next.cliOutput)).toMatch(
        /The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received type boolean/
      )
    })
    expect(stripAnsi(next.cliOutput)).not.toContain('webpack-internal:')
  })
})
