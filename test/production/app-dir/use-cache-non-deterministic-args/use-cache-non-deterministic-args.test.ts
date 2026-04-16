import { nextTestSetup } from 'e2e-utils'

describe('use-cache-non-deterministic-args', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn about non-deterministic cache args during on-demand prerender', async () => {
    const outputIndex = next.cliOutput.length
    await next.browser('/unknown')

    const output = next.cliOutput.slice(outputIndex)
    expect(output).not.toContain('Connection closed')
    expect(output).toContain(
      'Unexpected cache miss after cache warming phase during prerendering'
    )
  })

  it('should warn about non-deterministic cache args during runtime prefetch', async () => {
    const outputIndex = next.cliOutput.length

    let onRuntimePrefetchDone: () => void
    const runtimePrefetchDone = new Promise<void>((resolve) => {
      onRuntimePrefetchDone = resolve
    })

    // Visit /with-runtime-prefetch to render the Link. The link being visible
    // in the viewport triggers a runtime prefetch for the /known route.
    await next.browser('/with-runtime-prefetch', {
      beforePageLoad(page) {
        page.on('response', (res) => {
          const url = new URL(res.url())
          const request = res.request()
          if (
            url.pathname === '/known' &&
            request.headers()['next-router-prefetch'] === '2'
          ) {
            onRuntimePrefetchDone()
          }
        })
      },
    })

    await runtimePrefetchDone

    const output = next.cliOutput.slice(outputIndex)
    expect(output).not.toContain('Connection closed')
    expect(output).toContain(
      'Unexpected cache miss after cache warming phase during prerendering'
    )
  })
})
