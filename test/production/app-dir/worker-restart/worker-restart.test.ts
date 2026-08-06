import { nextTestSetup } from 'e2e-utils'

describe('worker-restart', () => {
  describe('timeout', () => {
    const { next } = nextTestSetup({
      files: __dirname + '/fixtures/timeout',
      skipStart: true,
    })

    it('should properly exhaust all restart attempts and not fail with any worker errors', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'Failed to build /bad-page/page: /bad-page (attempt 1 of 3) because it took more than 10 seconds. Retrying again shortly.'
      )
      expect(cliOutput).toContain(
        'Failed to build /bad-page/page: /bad-page (attempt 2 of 3) because it took more than 10 seconds. Retrying again shortly.'
      )
      expect(cliOutput).toContain(
        'Failed to build /bad-page/page: /bad-page after 3 attempts'
      )
      expect(cliOutput).not.toContain(
        'Error: Farm is ended, no more calls can be done to it'
      )
    })
  })

  describe('retries', () => {
    const { next } = nextTestSetup({
      files: __dirname + '/fixtures/retries',
      skipStart: true,
    })

    it('should support configurable static generation retries', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain('This page is bad!')
      expect(cliOutput).toContain(
        'Failed to build /page: / (attempt 2 of 3). Retrying again shortly.'
      )
      expect(cliOutput).toContain('Failed to build /page: / after 3 attempts.')
    })
  })

  describe('worker-kill', () => {
    const { next } = nextTestSetup({
      files: __dirname + '/fixtures/worker-kill',
      skipStart: true,
    })

    it('should fail the build if a worker process is killed', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'Next.js build worker exited with code: null and signal: SIGKILL'
      )
    })
  })
})
