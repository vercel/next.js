import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'socket-io',
  {
    files: __dirname,
    dependencies: {
      'socket.io': '4.7.2',
      'socket.io-client': '4.7.2',
      'utf-8-validate': '6.0.3',
      bufferutil: '4.0.8',
    },
  },
  ({ next }) => {
    it('should support socket.io without falling back to polling', async () => {
      let requestsCount = 0

      const browser1 = await next.browser(next.url, '/')
      const browser2 = await next.browser(next.url, '/', {
        beforePageLoad(page) {
          page.on('request', () => {
            requestsCount++
          })
        },
      })

      const input1 = await browser1.elementByCss('input')
      const input2 = await browser2.elementByCss('input')

      await input1.fill('hello world')
      await check(() => input2.inputValue(), /hello world/)

      const currentRequestsCount = requestsCount

      await input1.fill('123456')
      await check(() => input2.inputValue(), /123456/)

      // There should be no new requests (polling) and using the existing WS connection
      expect(requestsCount).toBe(currentRequestsCount)
    })
  }
)
