import http from 'node:http'

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
    nextConfig: {
      experimental: {
        webSocketRouteHandlers: true,
      },
    },
    // the socket.io setup relies on patching next's `http.Server` instance,
    // which we can't do when deployed
    skipDeployment: true,
  })

  it('preserves non-WebSocket custom upgrade listeners', async () => {
    await next.fetch('/api/socket')
    const outputIndex = next.cliOutput.length

    const status = await new Promise<number>((resolve, reject) => {
      const request = http.request({
        host: 'localhost',
        port: next.appPort,
        path: '/custom-upgrade',
        headers: {
          connection: 'Upgrade',
          upgrade: 'h2c',
          origin: 'https://cross-origin.example',
          'sec-websocket-key': Buffer.alloc(16).toString('base64'),
        },
      })
      request.once('upgrade', (response, socket) => {
        socket.destroy()
        resolve(response.statusCode!)
      })
      request.once('response', (response) => {
        response.resume()
        resolve(response.statusCode!)
      })
      request.once('error', reject)
      request.end()
    })

    expect(status).toBe(101)
    const output = next.cliOutput.slice(outputIndex)
    expect(output).toContain('delegated an upgrade event')
    expect(output).not.toContain('delegated a WebSocket upgrade')
  })

  it('should support socket.io without falling back to polling', async () => {
    let pollingRequestsCount = 0

    const browser1 = await next.browser('/')
    const browser2 = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = new URL(request.url())
          if (
            url.pathname.startsWith('/api/my_awesome_socket') &&
            url.searchParams.get('transport') === 'polling'
          ) {
            pollingRequestsCount++
          }
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

    expect(pollingRequestsCount).toBeGreaterThan(0)
    const currentPollingRequestsCount = pollingRequestsCount

    await input1.fill('123456')
    await retry(
      async () => expect(await input2.inputValue()).toContain('123456'),
      10000
    )

    // There should be no new requests (polling) and using the existing WS connection
    expect(pollingRequestsCount).toBe(currentPollingRequestsCount)
  })
})
