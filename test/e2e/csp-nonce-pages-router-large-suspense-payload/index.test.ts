import { nextTestSetup } from 'e2e-utils'

describe('Pages Router streaming with CSP nonce', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // React's streaming renderer defers a Suspense boundary into a separate
  // completion segment (with its own $RV/$RC helper scripts) once the
  // boundary's rendered byte size crosses `progressiveChunkSize` (12_800
  // bytes by default) — independent of whether anything in it is actually
  // asynchronous. The fixture page renders comfortably past that threshold.
  it('should apply the CSP nonce to inline scripts emitted for a large Suspense boundary', async () => {
    const $ = await next.render$('/')

    const streamingHelperScripts = $('script:not([src])').filter(
      (_, el) => $(el).html()?.includes('$R') ?? false
    )

    expect(streamingHelperScripts.length).toBeGreaterThan(0)
    streamingHelperScripts.each((_, el) => {
      expect(el.attribs['nonce']).toBe('test-nonce')
    })
  })

  it('should not raise CSP violations or hydration errors in the browser', async () => {
    const browser = await next.browser('/')

    expect(await browser.eval('document.body.innerText')).toContain(
      'padding content'
    )

    if (global.browserName === 'chrome') {
      const logs = await browser.log()
      const cspViolations = logs.filter((log) =>
        log.message.includes('Content Security Policy')
      )
      expect(cspViolations).toEqual([])
    }
  })
})
