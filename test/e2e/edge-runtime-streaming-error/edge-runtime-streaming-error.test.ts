import stripAnsi from 'next/dist/compiled/strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('edge-runtime-streaming-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
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
