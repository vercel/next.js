import { nextTestSetup } from 'e2e-utils'

describe('handle already sent response', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with fetch', async () => {
    expect(next.cliOutput).toContain('▲ Next.js')
    expect(next.cliOutput).toContain('- Local:')

    let res = await next.fetch('/')
    let text = await res.text()
    expect(text).toEqual('already sent')

    res = await next.fetch('/')
    text = await res.text()
    expect(text).toEqual('already sent')

    // Check to see that there's two instances of 'getServerSideProps' in
    // the output. If there's only one, then the page was not re-rendered.
    let i
    for (i = 0; i < 3; i++) {
      if ((next.cliOutput.match(/getServerSideProps/g) || []).length >= 2) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (i === 3) {
      throw new Error('Timed out waiting for logs to show')
    }

    // Headers should not be added after response is sent via
    // `getServerSideProps`. If they were, we would see this error.
    expect(next.cliOutput).not.toContain('ERR_HTTP_HEADERS_SENT')
  })
})
