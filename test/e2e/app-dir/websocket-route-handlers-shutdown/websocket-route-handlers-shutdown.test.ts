import http from 'node:http'
import WebSocket from 'ws'
import { isNextDev, nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

function connect(port: number | string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/ws`)
    const onError = (error: Error) => reject(error)
    socket.once('error', onError)
    socket.once('message', (message) => {
      socket.off('error', onError)
      expect(message.toString()).toBe('ready')
      resolve(socket)
    })
  })
}

function waitForClose(socket: WebSocket) {
  return new Promise<{ code: number; reason: string }>((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({ code, reason: reason.toString() })
    })
  })
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    socket.once('error', onError)
    socket.once('open', () => {
      socket.off('error', onError)
      resolve()
    })
  })
}

function requestUpgrade(port: number | string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: 'localhost',
      port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': Buffer.alloc(16).toString('base64'),
        'sec-websocket-version': '13',
      },
    })
    request.once('response', (response) => {
      response.resume()
      resolve(response.statusCode!)
    })
    request.once('upgrade', (response, socket) => {
      socket.destroy()
      resolve(response.statusCode!)
    })
    request.once('error', reject)
    request.end()
  })
}

async function triggerCustomAppClose(next: NextInstance) {
  const response = await next.fetch('/__close-next')
  expect(response.status).toBe(202)
}

async function finishCustomAppClose(next: NextInstance) {
  await retry(() => {
    expect(next.cliOutput).toContain('[custom-server] next app closed')
    expect(next.cliOutput).toContain(
      '[custom-server] upgrade listeners after app.close(): 0'
    )
  }, 10_000)

  // app.close() intentionally leaves the embedding HTTP server under the
  // custom server's control. Stop it only after the WebSocket drain completes.
  await next.stop('SIGKILL')
}

async function closeCustomApp(next: NextInstance, socket: WebSocket) {
  const closed = waitForClose(socket)
  await triggerCustomAppClose(next)

  await expect(closed).resolves.toEqual({ code: 1001, reason: '' })
  await finishCustomAppClose(next)
}

describe('WebSocket Route Handler process shutdown', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_EXIT_TIMEOUT_MS: '10000',
    },
  })

  if (skipped) return

  beforeAll(async () => {
    await next.start()
  })

  it('closes an established peer with 1001 before exiting', async () => {
    const socket = await connect(next.appPort)
    const closed = waitForClose(socket)
    const stopped = next.stop('SIGTERM')

    await expect(closed).resolves.toEqual({ code: 1001, reason: '' })
    await stopped
    expect(next.cliOutput).toContain('[websocket-close-hook] finished')
  })
})

describe('WebSocket Route Handler custom-server shutdown', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    forcedPort: 'random',
    startCommand: 'node server.mjs',
    serverReadyPattern: /Custom server ready/,
    env: {
      NODE_ENV: isNextDev ? 'development' : 'production',
    },
  })

  if (skipped) return

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    await next.stop()
  })

  it('handles a WebSocket as the first custom-server request', async () => {
    const socket = await connect(next.appPort)
    await closeCustomApp(next, socket)
    expect(next.cliOutput).toContain('[websocket-close-hook] finished')
  })

  it('waits for an in-flight route before completing app.close()', async () => {
    const socket = new WebSocket(`ws://localhost:${next.appPort}/slow`)
    const opened = waitForOpen(socket)
    const closed = waitForClose(socket)

    await retry(() => {
      expect(next.cliOutput).toContain('[slow-websocket-upgrade] started')
    }, 10_000)
    await triggerCustomAppClose(next)
    await retry(() => {
      expect(next.cliOutput).toContain('[custom-server] next app closing')
    })
    const releaseResponse = await next.fetch('/__release-slow')
    expect(releaseResponse.status).toBe(204)

    await expect(opened).resolves.toBeUndefined()
    await expect(closed).resolves.toEqual({ code: 1001, reason: '' })
    await finishCustomAppClose(next)

    const routeFinished = next.cliOutput.indexOf(
      '[slow-websocket-upgrade] finished'
    )
    const appClosing = next.cliOutput.indexOf(
      '[custom-server] next app closing'
    )
    const appClosed = next.cliOutput.indexOf('[custom-server] next app closed')
    expect(routeFinished).toBeGreaterThan(appClosing)
    expect(appClosed).toBeGreaterThan(routeFinished)
    expect(next.cliOutput).toContain('[slow-websocket-upgrade] opened')
  })

  it('removes duplicate registrations of its stable upgrade handler', async () => {
    expect((await next.fetch('/__attach-duplicate-next-upgrade')).status).toBe(
      204
    )
    expect(await (await next.fetch('/__upgrade-listener-count')).text()).toBe(
      '2'
    )

    await triggerCustomAppClose(next)
    await finishCustomAppClose(next)
  })

  if (isNextDev && process.env.IS_WEBPACK_TEST) {
    it('finishes custom shutdown when the harness delivers duplicate signals', async () => {
      const socket = await connect(next.appPort)
      const closed = waitForClose(socket)
      const stopped = next.stop('SIGTERM')

      await expect(closed).resolves.toEqual({ code: 1001, reason: '' })
      await stopped
      expect(next.cliOutput).toContain('[websocket-close-hook] finished')
    })
  }
})

describe('WebSocket Route Handler manual custom-server ownership', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    forcedPort: 'random',
    startCommand: 'node server.mjs',
    serverReadyPattern: /Custom server ready/,
    env: {
      NODE_ENV: isNextDev ? 'development' : 'production',
      NEXT_TEST_MANUAL_UPGRADE_OWNER: '1',
    },
  })

  if (skipped) return

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    await next.stop()
  })

  it('removes a manually attached handler after WebSocket-only traffic', async () => {
    await expect(
      requestUpgrade(next.appPort, '/ws?manual-owner=1')
    ).resolves.toBe(418)

    await triggerCustomAppClose(next)
    await retry(() => {
      expect(next.cliOutput).toContain('[custom-server] next app closed')
      expect(next.cliOutput).toContain(
        '[custom-server] upgrade listeners after app.close(): 1'
      )
    }, 10_000)
    expect(next.cliOutput).not.toContain(
      '[manual-upgrade-owner] Next.js route raced'
    )
    await expect(
      requestUpgrade(next.appPort, '/ws?after-next-close=1')
    ).resolves.toBe(418)
  })

  it('does not duplicate a manual handler after lazy HTTP discovery', async () => {
    await expect(
      requestUpgrade(next.appPort, '/ws?manual-owner=1')
    ).resolves.toBe(418)

    // The first ordinary request lazily discovers the embedding server. The
    // explicit Next.js listener and the custom owner must remain the only two
    // upgrade listeners.
    expect((await next.fetch('/')).status).toBe(200)
    expect(await (await next.fetch('/__upgrade-listener-count')).text()).toBe(
      '2'
    )

    await triggerCustomAppClose(next)
    await retry(() => {
      expect(next.cliOutput).toContain('[custom-server] next app closed')
      expect(next.cliOutput).toContain(
        '[custom-server] upgrade listeners after app.close(): 1'
      )
    }, 10_000)
    expect(next.cliOutput).not.toContain(
      '[manual-upgrade-owner] Next.js route raced'
    )
  })
})

if (isNextDev === false && process.env.IS_TURBOPACK_TEST) {
  describe('WebSocket Route Handler bounded shutdown tasks', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      env: {
        NEXT_EXIT_TIMEOUT_MS: '15000',
        NEXT_TEST_STUCK_WEBSOCKET_CLOSE: '1',
      },
    })

    if (skipped) return

    beforeAll(async () => {
      await next.start()
    })

    it('exits after the grace period when a close hook never settles', async () => {
      const socket = await connect(next.appPort)
      const closed = waitForClose(socket)
      const stopped = next.stop('SIGTERM')

      await expect(closed).resolves.toEqual({ code: 1001, reason: '' })
      await stopped
      expect(next.cliOutput).toContain(
        '[websocket-close-hook] started and stuck'
      )
    })
  })

  describe('WebSocket Route Handler bounded custom-server tasks', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
      forcedPort: 'random',
      startCommand: 'node server.mjs',
      serverReadyPattern: /Custom server ready/,
      env: {
        NODE_ENV: 'production',
        NEXT_TEST_STUCK_WEBSOCKET_CLOSE: '1',
      },
    })

    if (skipped) return

    beforeAll(async () => {
      await next.start()
    })

    it('bounds a stuck close hook during app.close()', async () => {
      const socket = await connect(next.appPort)
      await closeCustomApp(next, socket)
      expect(next.cliOutput).toContain(
        '[websocket-close-hook] started and stuck'
      )
    })
  })
}
