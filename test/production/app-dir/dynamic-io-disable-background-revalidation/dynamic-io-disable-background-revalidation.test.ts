import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('dynamic-io-disable-background-revalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  const executeRevalidationRequest = async (
    url: string,
    isISRRequest = true
  ) => {
    const json = await next.readJSON('.next/prerender-manifest.json')
    const previewModeId = json.preview.previewModeId
    const headers = isISRRequest
      ? {
          'x-prerender-revalidate': previewModeId,
          'x-next-stale-isr': '1',
        }
      : {
          'x-prerender-revalidate': previewModeId,
        }
    const response = await next.fetch(url, {
      method: 'HEAD',
      headers,
    })
    return response
  }

  it('should use cache without external revalidation', async () => {
    const browser = await next.browser('/')
    const cachedRandomNumber = await browser.elementById('random-cached').text()
    const inlineRandomNumber = await browser.elementById('inline-random').text()
    await browser.refresh()

    await retry(async () => {
      const randomNumber2 = await browser.elementById('random-cached').text()
      const inlineRandomNumber2 = await browser
        .elementById('inline-random')
        .text()
      expect(randomNumber2).toEqual(cachedRandomNumber)
      expect(inlineRandomNumber2).toEqual(inlineRandomNumber)
      await browser.refresh()
    })
  })

  it('should revalidate inline on ISR revalidation request', async () => {
    // We need to run this first so that we can prepopulate the in memory cache handler
    await executeRevalidationRequest('/')

    let browser = await next.browser('/')
    const inlineRandomNumber = await browser.elementById('inline-random').text()
    const cachedRandomNumber = await browser.elementById('random-cached').text()

    // We need to wait for the dynamicIO cache to be expired
    await waitFor(1000)
    const response = await executeRevalidationRequest('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-nextjs-cache')).toBe('REVALIDATED')
    await browser.refresh()

    // First request after ISR revalidation should revalidate inline but not cached
    const inlineRandomNumber2 = await browser
      .elementById('inline-random')
      .text()
    const cachedRandomNumber2 = await browser
      .elementById('random-cached')
      .text()
    expect(inlineRandomNumber2).not.toEqual(inlineRandomNumber)
    expect(cachedRandomNumber2).toEqual(cachedRandomNumber)
    await browser.refresh()

    // All subsequent requests should not revalidate
    await retry(async () => {
      const inlineRandomNumber3 = await browser
        .elementById('inline-random')
        .text()
      const cachedRandomNumber3 = await browser
        .elementById('random-cached')
        .text()
      expect(inlineRandomNumber3).toEqual(inlineRandomNumber2)
      expect(cachedRandomNumber3).toEqual(cachedRandomNumber2)
      await browser.refresh()
    })
  })
})
