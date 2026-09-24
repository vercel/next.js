import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('bfcache-iframe', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('preserves iframe across bfcache navigations', async () => {
    const browser = await next.browser('/')

    async function getIframeTimestamp() {
      return await browser.eval(
        `(() => {
          const iframe = document.querySelector('#test-iframe');
          if (!iframe || !iframe.contentWindow || !iframe.contentWindow.document) return null;
          const el = iframe.contentWindow.document.querySelector('#load-time');
          return el ? el.innerText : null;
        })()`
      )
    }

    // Initial visit to /
    let initialTime: string | null = null
    await retry(async () => {
      initialTime = await getIframeTimestamp()
      expect(initialTime).not.toBeNull()
    })
    console.log('[TEST] Initial load on / -> iframe time:', initialTime)

    // 1st Round Trip: Navigate to /b
    await browser.elementByCss('#link-b').click()
    await retry(async () => {
      expect(await browser.elementByCss('#b-title').text()).toBe('Page B')
    })

    // Navigate back to / via browser back
    await browser.back()
    await retry(async () => {
      expect(await browser.elementByCss('#home-title').text()).toBe('Home Page')
    })

    const round1Time = await getIframeTimestamp()
    console.log('[TEST] Round trip 1 back to / -> iframe time:', round1Time)
    console.log('[TEST] Round trip 1 reloaded?', round1Time !== initialTime)
    expect(round1Time).toBe(initialTime)

    // 2nd Round Trip: Navigate forward to /b
    await browser.forward()
    await retry(async () => {
      expect(await browser.elementByCss('#b-title').text()).toBe('Page B')
    })

    // Navigate back to / via browser back
    await browser.back()
    await retry(async () => {
      expect(await browser.elementByCss('#home-title').text()).toBe('Home Page')
    })

    const round2Time = await getIframeTimestamp()
    console.log('[TEST] Round trip 2 back to / -> iframe time:', round2Time)
    console.log('[TEST] Round trip 2 reloaded?', round2Time !== initialTime)
    expect(round2Time).toBe(initialTime)

    // 3rd Round Trip: Navigate forward to /b
    await browser.forward()
    await retry(async () => {
      expect(await browser.elementByCss('#b-title').text()).toBe('Page B')
    })

    // Navigate back to / via browser back
    await browser.back()
    await retry(async () => {
      expect(await browser.elementByCss('#home-title').text()).toBe('Home Page')
    })

    const round3Time = await getIframeTimestamp()
    console.log('[TEST] Round trip 3 back to / -> iframe time:', round3Time)
    console.log('[TEST] Round trip 3 reloaded?', round3Time !== initialTime)
    expect(round3Time).toBe(initialTime)
  })
})
