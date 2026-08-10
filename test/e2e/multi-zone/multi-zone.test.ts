import { nextTestSetup } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'
import http from 'node:http'
import path from 'path'
import WebSocket from 'ws'

describe('multi-zone', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'app'),
    skipDeployment: true,
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    serverReadyPattern: /Next mode: (production|development)/,
    packageJson: {
      scripts: {
        dev: 'node server.js',
        build: 'next build apps/host && next build apps/guest',
        start: 'NODE_ENV=production node server.js',
        'post-build': 'echo done',
      },
    },
    dependencies: require('./app/package.json').dependencies,
  })

  if (skipped) {
    return
  }

  it.each([
    { pathname: '/', content: ['hello from host app'] },
    { pathname: '/guest', content: ['hello from guest app'] },
    {
      pathname: '/blog/post-1',
      content: ['hello from host app /blog/[slug]'],
    },
    {
      pathname: '/guest/blog/post-1',
      content: ['hello from guest app /blog/[slug]'],
    },
    {
      pathname: '/guest/another/post-1',
      content: ['hello from guest app /another/[slug]'],
    },
  ])(
    'should correctly respond for $pathname',
    async ({ pathname, content }) => {
      const res = await next.fetch(pathname, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)

      const html = await res.text()

      for (const item of content) {
        expect(html).toContain(item)
      }
    }
  )

  if (isNextDev) {
    async function runHMRTest(app: string) {
      const isHostApp = app === 'host'
      const browser = await next.browser(isHostApp ? '/' : app)
      expect(await browser.elementByCss('body').text()).toContain(
        `hello from ${app} app`
      )
      const initialTimestamp = await browser.elementById('now').text()

      expect(await browser.elementByCss('body').text()).not.toContain(
        'hmr content'
      )

      await waitFor(1000)

      // verify that the page isn't unexpectedly reloading in the background
      const newTimestamp = await browser.elementById('now').text()
      expect(newTimestamp).toBe(initialTimestamp)

      // trigger HMR
      const filePath = `apps/${app}/pages/index.tsx`
      const content = await next.readFile(filePath)

      const patchedContent = content.replace(
        `const editedContent = ''`,
        `const editedContent = 'hmr content'`
      )
      await next.patchFile(filePath, patchedContent)

      await check(() => browser.elementByCss('body').text(), /hmr content/)

      // restore original content
      await next.patchFile(filePath, content)
    }

    it('should support HMR in both apps', async () => {
      await runHMRTest('host')
      await runHMRTest('guest')
    })
  }

  it('isolates WebSocket routes and lifecycle state between apps', async () => {
    const [hostReady, guestReady] = await Promise.all([
      next.fetch('/'),
      next.fetch('/guest'),
    ])
    expect(hostReady.status).toBe(200)
    expect(guestReady.status).toBe(200)
    expect(
      await next.fetch('/__enable-upgrade-dispatcher', { method: 'POST' })
    ).toHaveProperty('status', 204)

    function connect(pathname: string, origin: string) {
      return new Promise<{ socket: WebSocket; message: string }>(
        (resolve, reject) => {
          const socket = new WebSocket(
            `ws://localhost:${next.appPort}${pathname}`,
            { origin }
          )
          socket.once('message', (data) => {
            resolve({ socket, message: data.toString() })
          })
          socket.once('error', reject)
        }
      )
    }

    function nextMessage(socket: WebSocket) {
      return new Promise<string>((resolve) => {
        socket.once('message', (data) => resolve(data.toString()))
      })
    }

    function requestUpgrade(
      pathname: string,
      origin: string,
      extraHeaders: Record<string, string> = {}
    ) {
      return new Promise<number>((resolve, reject) => {
        const request = http.request({
          host: 'localhost',
          port: next.appPort,
          path: pathname,
          headers: {
            connection: 'Upgrade',
            origin,
            'sec-websocket-key': Buffer.alloc(16).toString('base64'),
            'sec-websocket-version': '13',
            upgrade: 'websocket',
            ...extraHeaders,
          },
        })
        request.once('response', (response) => {
          response.resume()
          response.once('end', () => resolve(response.statusCode!))
        })
        request.once('upgrade', (response, socket) => {
          socket.destroy()
          resolve(response.statusCode!)
        })
        request.once('error', reject)
        request.end()
      })
    }

    expect(
      await requestUpgrade('/missing-socket', 'https://host.example')
    ).toBe(404)
    expect(await requestUpgrade('/socket', 'https://guest.example')).toBe(403)

    const malformedLogStart = next.cliOutput.length
    expect(
      await requestUpgrade('/socket', 'https://host.example', {
        'transfer-encoding': 'chunked',
      })
    ).toBe(400)
    expect(next.cliOutput.slice(malformedLogStart)).not.toContain(
      'raw HTTP response already committed'
    )

    const host = await connect('/socket', 'https://host.example')
    const guest = await connect('/guest/socket', 'https://guest.example')
    expect(host.message).toBe('host')
    expect(guest.message).toBe('guest')

    const hostClosed = new Promise<number>((resolve) => {
      host.socket.once('close', resolve)
    })
    expect(
      await next.fetch('/__close/host', { method: 'POST' })
    ).toHaveProperty('status', 204)
    expect(await hostClosed).toBe(1001)

    const guestEcho = nextMessage(guest.socket)
    guest.socket.send('still-open')
    expect(await guestEcho).toBe('guest:still-open')

    const guestClosed = new Promise<number>((resolve) => {
      guest.socket.once('close', resolve)
    })
    expect(
      await next.fetch('/__close/guest', { method: 'POST' })
    ).toHaveProperty('status', 204)
    expect(await guestClosed).toBe(1001)
  })
})
