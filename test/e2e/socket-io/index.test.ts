import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('socket-io', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'socket.io': '4.7.2',
      'socket.io-client': '4.7.2',
      'utf-8-validate': '6.0.3',
      bufferutil: '4.0.8',
    },
    // the socket.io setup relies on patching next's `http.Server` instance,
    // which we can't do when deployed
    skipDeployment: true,
  })

  it('should support socket.io without falling back to polling', async () => {
    let requestsCount = 0

    const browser1 = await next.browser('/')
    const browser2 = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', () => {
          requestsCount++
        })
      },
    })

    await Promise.all([
      retry(async () =>
        expect(await browser1.elementByCss('#status').text()).toBe('Connected')
      ),
      retry(async () =>
        expect(await browser2.elementByCss('#status').text()).toBe('Connected')
      ),
    ])

    const input1 = await browser1.elementByCss('input')
    const input2 = await browser2.elementByCss('input')

    await input1.fill('hello world')
    await retry(
      async () => expect(await input2.inputValue()).toContain('hello world'),
      10000
    )

    expect(requestsCount).toBeGreaterThan(0)
    const currentRequestsCount = requestsCount

    await input1.fill('123456')
    await retry(
      async () => expect(await input2.inputValue()).toContain('123456'),
      10000
    )

    // There should be no new requests (polling) and using the existing WS connection
    expect(requestsCount).toBe(currentRequestsCount)
  })
})
