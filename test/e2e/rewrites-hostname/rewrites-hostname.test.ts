import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import createTargetServer from './target-server'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely depends on a local server, proxy, process, or dynamically allocated port.
// @force-gate !deploy
describe('rewrites hostname', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let targetPort: number | null = null
  let closeTargetServer: (() => Promise<void>) | null = null

  beforeAll(async () => {
    targetPort = await findPort()
    const closeServer = await createTargetServer(targetPort)
    closeTargetServer = closeServer
    await next.start({
      env: {
        TEST_TARGET_PORT: String(targetPort),
        TEST_KEEP_ALIVE: 'false',
      },
    })
  })

  afterAll(async () => {
    await closeTargetServer()
  })

  it('should navigate to a rewrite using unicode without error', async () => {
    const response = await next.fetch(`/rewrite-idn-case-unicode`)

    expect(await response.json()).toEqual({
      forwardedHost: `localhost:${next.appPort}`,
      host: `xn--6qq79v.localhost:${targetPort}`,
      socketId: expect.any(Number),
    })
  })

  it('does not reuse upstream connections when keepAlive is false', async () => {
    const first = await next.fetch('/rewrite-idn-case-unicode')
    const { socketId: firstSocketId } = await first.json()
    const second = await next.fetch('/rewrite-idn-case-unicode')
    const { socketId: secondSocketId } = await second.json()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(secondSocketId).not.toBe(firstSocketId)
  })

  it('reuses upstream connections when keepAlive is true', async () => {
    await next.stop()
    await next.start({
      env: {
        TEST_TARGET_PORT: String(targetPort),
        TEST_KEEP_ALIVE: 'true',
      },
    })

    const first = await next.fetch('/rewrite-idn-case-unicode')
    const { socketId: firstSocketId } = await first.json()
    const second = await next.fetch('/rewrite-idn-case-unicode')
    const { socketId: secondSocketId } = await second.json()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(secondSocketId).toBe(firstSocketId)
  })
})
