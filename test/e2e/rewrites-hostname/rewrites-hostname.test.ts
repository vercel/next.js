import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import createTargetServer from './target-server'

describe('rewrites hostname', () => {
  const { skipped, next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  let targetPort: number | null = null
  let closeTargetServer: (() => Promise<void>) | null = null

  beforeAll(async () => {
    targetPort = await findPort()
    const closeServer = await createTargetServer(targetPort)
    closeTargetServer = closeServer
    await next.start({
      env: { TEST_TARGET_PORT: String(targetPort) },
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
    })
  })
})
