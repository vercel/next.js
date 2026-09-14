import { nextTestSetup } from 'e2e-utils'

describe('API body parser', () => {
  describe('without custom server', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      // Uses a custom HTTP/proxy server in front of Next.js; not applicable in deploy mode.
      skipDeployment: true,
    })
    if (skipped) return

    it('should parse JSON body', async () => {
      const res = await next.fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      const data = await res.json()
      expect(data).toEqual([{ title: 'Nextjs' }])
    })
  })

  describe('with custom server (pre-parsed body)', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { CUSTOM_SERVER: 'true' },
      dependencies: {
        express: '4',
      },
      // Uses a custom HTTP/proxy server in front of Next.js; not applicable in deploy mode.
      skipDeployment: true,
    })
    if (skipped) return

    it('should not throw if request body is already parsed in custom middleware', async () => {
      const res = await next.fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      const data = await res.json()
      expect(data).toEqual([{ title: 'Nextjs' }])
    })

    it("should not throw if request's content-type is invalid", async () => {
      const res = await next.fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      expect(res.status).toBe(200)
    })
  })
})
