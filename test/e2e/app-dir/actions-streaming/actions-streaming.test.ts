import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('actions-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('actions returning a ReadableStream', () => {
    it('should properly stream the response without buffering', async () => {
      const browser = await next.browser('/readable-stream')
      await browser.elementById('stream-button').click()

      expect(await browser.elementById('stream-button').text()).toBe(
        'Streaming...'
      )

      // If we're streaming properly, we should see the first chunks arrive
      // quickly.
      expect(await browser.elementByCss('h3').text()).toMatch(
        /Received \d+ chunks/
      )
      expect(await browser.elementById('chunks').text()).toInclude(
        'Lorem ipsum dolor sit'
      )

      // Finally, wait for the response to finish streaming.
      await waitFor(5000)
      await retry(
        async () => {
          expect(await browser.elementByCss('h3').text()).toBe(
            'Received 50 chunks'
          )
          expect(await browser.elementById('stream-button').text()).toBe(
            'Start Stream'
          )
        },
        10000,
        1000
      )
    })
  })
})
