import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// A deployment adapter calls the proxy through the `handler` export of the
// proxy module, with or without an `AbortSignal` for the request. A `Request`
// that is constructed with a signal follows that signal for as long as it
// lives, which costs time and memory on every request. Next.js must only
// construct the request with a signal when it was given one.
describe('proxy-request-signal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()
  })

  async function invokeProxy(signal: 'none' | 'aborted') {
    const { stdout } = await execa(
      process.execPath,
      ['invoke-proxy.js', signal],
      { cwd: next.testDir, stderr: 'inherit' }
    )
    return JSON.parse(stdout.trim().split('\n').pop()!)
  }

  it('should not construct the request with a signal when the proxy is called without one', async () => {
    expect(await invokeProxy('none')).toEqual({
      status: 200,
      body: { aborted: false },
      requestSignals: ['none'],
    })
  })

  it('should construct the request with the signal that the proxy is called with', async () => {
    expect(await invokeProxy('aborted')).toEqual({
      status: 200,
      body: { aborted: true },
      requestSignals: ['given'],
    })
  })
})
