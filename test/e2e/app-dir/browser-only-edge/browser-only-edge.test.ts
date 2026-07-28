import { isReact18, nextTestSetup } from 'e2e-utils'

describe('browserOnly in the Edge Runtime', () => {
  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it.skip('requires the Edge Runtime, which Cache Components does not support', () => {})
    return
  }

  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('renders a fallback on the server and content after hydration', async () => {
    const $ = await next.render$('/')
    expect($('#edge-fallback').text()).toBe('edge fallback')
    expect($('#edge-browser-content').length).toBe(0)

    const browser = await next.browser('/')
    expect(await browser.elementByCss('#edge-browser-content').text()).toBe(
      'edge browser content'
    )
  })
  if (!isReact18) {
    it('renders a Pages Router fallback without reporting bailout errors', async () => {
      const $ = await next.render$('/browser-only')
      expect($('#pages-edge-fallback').text()).toBe('pages edge fallback')
      expect($('#pages-edge-browser-content').length).toBe(0)

      const browser = await next.browser('/browser-only', {
        pushErrorAsConsoleLog: true,
      })
      expect(
        await browser.elementByCss('#pages-edge-browser-content').text()
      ).toBe('pages edge browser content')

      const logs = await browser.log()
      expect(logs.filter((entry) => entry.source === 'error')).toEqual([])
      if (!isNextDeploy) {
        expect(
          next.cliOutput.includes(
            'Bail out to client-side rendering: browserOnly()'
          )
        ).toBe(false)
      }
    })
  }
})
