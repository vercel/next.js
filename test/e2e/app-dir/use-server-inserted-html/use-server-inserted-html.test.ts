import { nextTestSetup } from 'e2e-utils'

async function resolveStreamResponse(response: any, onData?: any) {
  let result = ''
  onData = onData || (() => {})

  for await (const chunk of response.body) {
    result += chunk.toString()
    onData(chunk.toString(), result)
  }
  return result
}

describe('use-server-inserted-html', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'styled-components': 'latest',
      'server-only': 'latest',
    },
  })

  it('should render initial styles of css-in-js in nodejs SSR correctly', async () => {
    const $ = await next.render$('/css-in-js')
    const head = $('head').html()

    // from styled-jsx

    expect(head).toMatch(/{color:(\s*)purple;?}/) // styled-jsx/style
    expect(head).toMatch(/{color:(\s*)(?:hotpink|#ff69b4);?}/) // styled-jsx/css

    // from styled-components
    expect(head).toMatch(/{color:(\s*)(?:blue|#00f);?}/)
  })

  it('should render initial styles of css-in-js in edge SSR correctly', async () => {
    const $ = await next.render$('/css-in-js/edge')
    const head = $('head').html()

    // from styled-jsx
    expect(head).toMatch(/{color:(\s*)purple;?}/) // styled-jsx/style
    expect(head).toMatch(/{color:(\s*)(?:hotpink|#ff69b4);?}/) // styled-jsx/css

    // from styled-components
    expect(head).toMatch(/{color:(\s*)(?:blue|#00f);?}/)
  })

  it('should render css-in-js suspense boundary correctly', async () => {
    await next.fetch('/css-in-js/suspense').then(async (response) => {
      const results = []

      await resolveStreamResponse(response, (chunk: string) => {
        const isSuspenseyDataResolved =
          /<style[^<>]*>(\s)*.+{padding:2px;(\s)*color:orange;}/.test(chunk)
        if (isSuspenseyDataResolved) results.push('data')

        // check if rsc refresh script for suspense show up, the test content could change with react version
        const hasRCScript = /\$RC=function/.test(chunk)
        if (hasRCScript) results.push('refresh-script')

        const isFallbackResolved = chunk.includes('$test-fallback-sentinel')
        if (isFallbackResolved) results.push('fallback')
      })

      expect(results).toEqual(['fallback', 'data', 'refresh-script'])
    })
    // // TODO-APP: fix streaming/suspense within browser for test suite
    // const browser = await next.browser( '/css-in-js', { waitHydration: false })
    // const footer = await browser.elementByCss('#footer')
    // expect(await footer.text()).toBe('wait for fallback')
    // expect(
    //   await browser.eval(
    //     `window.getComputedStyle(document.querySelector('#footer')).borderColor`
    //   )
    // ).toBe('rgb(255, 165, 0)')
    // // Suspense is not rendered yet
    // expect(
    //   await browser.eval(
    //     `document.querySelector('#footer-inner')`
    //   )
    // ).toBe('null')

    // // Wait for suspense boundary
    // await check(
    //   () => browser.elementByCss('#footer').text(),
    //   'wait for footer'
    // )
    // expect(
    //   await browser.eval(
    //     `window.getComputedStyle(document.querySelector('#footer-inner')).color`
    //   )
    // ).toBe('rgb(255, 165, 0)')
  })
})
