import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

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

  describe('with experimental.staticGenerationAdaptive', () => {
    describe.each([
      ['child processes', false],
      ['worker threads', true],
    ])('prerenderEarlyExit (%s)', (_name, workerThreads) => {
      const { next } = nextTestSetup({
        files: { app: new FileRef(join(__dirname, 'fixtures/retries/app')) },
        skipStart: true,
        nextConfig: {
          experimental: {
            staticGenerationAdaptive: true,
            prerenderEarlyExit: true,
            workerThreads,
          },
        },
      })

      it('fails the build without retrying the page as a worker crash', async () => {
        const { cliOutput, exitCode } = await next.build()
        expect(exitCode).not.toBe(0)
        expect(cliOutput).toContain('This page is bad!')
        expect(cliOutput).toMatch(
          /Export encountered an error .*exiting the build/
        )
        expect(cliOutput).not.toMatch(
          /Retrying \d+ page\(s\) from a .*build worker/
        )
        expect(cliOutput).not.toContain('crashed the build worker')
      })
    })

    describe('timeout', () => {
      const { next } = nextTestSetup({
        // The fixture's own next.config.js is replaced by `nextConfig`.
        files: { app: new FileRef(join(__dirname, 'fixtures/timeout/app')) },
        skipStart: true,
        nextConfig: {
          staticPageGenerationTimeout: 10,
          experimental: { staticGenerationAdaptive: true },
        },
      })

      it('should exhaust all restart attempts without worker errors', async () => {
        const { cliOutput } = await next.build()
        expect(cliOutput).toContain(
          'Failed to build /bad-page/page: /bad-page (attempt 1 of 3) because it took more than 10 seconds. Retrying again shortly.'
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
        // The fixture's own next.config.js is replaced by `nextConfig`.
        files: { app: new FileRef(join(__dirname, 'fixtures/retries/app')) },
        skipStart: true,
        nextConfig: {
          experimental: {
            staticGenerationRetryCount: 3,
            staticGenerationAdaptive: true,
          },
        },
      })

      it('should support configurable static generation retries', async () => {
        const { cliOutput } = await next.build()
        expect(cliOutput).toContain('This page is bad!')
        expect(cliOutput).toContain(
          'Failed to build /page: / (attempt 2 of 3). Retrying again shortly.'
        )
        expect(cliOutput).toContain(
          'Failed to build /page: / after 3 attempts.'
        )
      })
    })

    describe('worker-kill', () => {
      const { next } = nextTestSetup({
        // The fixture's own next.config.js is replaced by `nextConfig`.
        files: {
          app: new FileRef(join(__dirname, 'fixtures/worker-kill/app')),
        },
        skipStart: true,
        nextConfig: {
          experimental: { staticGenerationAdaptive: true },
        },
      })

      it('should retry a page that kills its worker, then fail the build', async () => {
        const { cliOutput, exitCode } = await next.build()
        expect(exitCode).not.toBe(0)
        expect(cliOutput).toContain(
          'Next.js build worker exited with code: null and signal: SIGKILL'
        )
        expect(cliOutput).toContain(
          'Static generation failed: rendering "/bad-page" crashed the build worker 3 times.'
        )
      })
    })
  })
})
