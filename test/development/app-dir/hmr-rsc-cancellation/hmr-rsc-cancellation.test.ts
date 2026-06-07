import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-rsc-cancellation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function runCancellationScenario(useNodeStreams = true) {
    await next.patchFile(
      'next.config.js',
      `/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    useNodeStreams: ${useNodeStreams},
  },
}

module.exports = nextConfig
`
    )
    await next.patchFile('app/page.tsx', (source) =>
      source
        .replace(/const delayMs = \d+/, 'const delayMs = 0')
        .replace(
          /const marker = '(?:initial|slow|latest)'/,
          "const marker = 'initial'"
        )
    )
    await next.start()
    try {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementById('marker').text()).toBe('initial')
      })

      await browser.eval(() => {
        const originalFetch = window.fetch
        const requests: Array<{ aborted: boolean; settled: boolean }> = []

        ;(window as any).__hmrRscRequests = requests
        ;(window as any).__hmrReloadSentinel = true
        window.fetch = (input, init) => {
          const headers = new Headers(init?.headers)
          if (headers.get('next-hmr-refresh') === '1') {
            const request = {
              aborted: init?.signal?.aborted ?? false,
              settled: false,
            }
            requests.push(request)
            init?.signal?.addEventListener(
              'abort',
              () => {
                request.aborted = true
              },
              { once: true }
            )

            const result = originalFetch(input, init)
            result.then(
              () => {
                request.settled = true
              },
              () => {
                request.settled = true
              }
            )
            return result
          }
          return originalFetch(input, init)
        }
      })
      const cliOutputStart = next.cliOutput.length

      const originalSource = await next.readFile('app/page.tsx')
      const slowSource = originalSource
        .replace('const delayMs = 0', 'const delayMs = 5000')
        .replace("const marker = 'initial'", "const marker = 'slow'")
      const latestSource = originalSource.replace(
        "const marker = 'initial'",
        "const marker = 'latest'"
      )

      await next.patchFile('app/page.tsx', slowSource)

      await retry(async () => {
        const requestCount = await browser.eval(
          () => (window as any).__hmrRscRequests.length
        )
        expect(requestCount).toBe(1)
      })

      await next.patchFile('app/page.tsx', latestSource)

      if (useNodeStreams) {
        await retry(async () => {
          expect(await browser.elementById('marker').text()).toBe('latest')
        })
      } else {
        await retry(async () => {
          expect(
            await browser.eval(
              () =>
                (window as any).__hmrRscRequests.length >= 2 &&
                (window as any).__hmrRscRequests.at(-1)?.settled === true
            )
          ).toBe(true)
          expect(next.cliOutput.slice(cliOutputStart)).toContain(
            '[hmr-rsc-cancellation] render started: latest'
          )
        })
      }

      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputStart)).toContain(
          '[hmr-rsc-cancellation] cache fill finished: slow'
        )
      }, 7000)
      await browser.eval(async () => {
        const response = await fetch('/redirect-target')
        await response.arrayBuffer()
      })
      const result = await browser.eval(() => ({
        requests: (window as any).__hmrRscRequests,
        didReload: (window as any).__hmrReloadSentinel !== true,
      }))

      expect(result.didReload).toBe(false)
      expect(result.requests.length).toBeGreaterThanOrEqual(2)
      expect(result.requests[0]).toMatchObject({
        aborted: true,
        settled: true,
      })
      expect(result.requests.at(-1)).toMatchObject({
        aborted: false,
        settled: true,
      })
      const cliOutput = next.cliOutput.slice(cliOutputStart)
      expect(cliOutput).not.toContain(
        'Failed to fetch RSC payload for http://localhost'
      )
      expect(cliOutput).not.toContain(
        'Cannot write to a closing writable stream'
      )
      expect(cliOutput).not.toContain('unhandledRejection: ResponseAborted')
      expect(
        cliOutput.match(/\[hmr-rsc-cancellation\] render started: slow/g)
      ).toHaveLength(1)
    } finally {
      await next.stop()
    }
  }

  it('cancels a superseded Server Component HMR request', async () => {
    await runCancellationScenario()
  })

  it('cancels a superseded HMR request with web streams', async () => {
    await runCancellationScenario(false)
  })

  it('preserves a Server Action redirect while the target route compiles', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { cacheComponents: true }\n`
    )
    await next.start()
    const browser = await next.browser('/')

    await browser.elementById('redirect-to-target').click()

    await retry(async () => {
      expect(await browser.elementById('target').text()).toBe('target')
    })

    await next.stop()
  })

  it('preserves the existing behavior when cancellation is disabled', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
  cacheComponents: true,
  experimental: {
    serverComponentsHmrCancellation: false,
  },
}\n`
    )
    await next.patchFile('app/page.tsx', (source) =>
      source
        .replace(/const delayMs = \d+/, 'const delayMs = 0')
        .replace(
          /const marker = '(?:initial|slow|latest)'/,
          "const marker = 'initial'"
        )
    )
    await next.start()

    const browser = await next.browser('/')
    await browser.eval(() => {
      const originalFetch = window.fetch
      const requests: Array<{ aborted: boolean; settled: boolean }> = []
      ;(window as any).__hmrRscRequests = requests
      window.fetch = (input, init) => {
        const headers = new Headers(init?.headers)
        if (headers.get('next-hmr-refresh') === '1') {
          const request = {
            aborted: init?.signal?.aborted ?? false,
            settled: false,
          }
          requests.push(request)
          init?.signal?.addEventListener(
            'abort',
            () => {
              request.aborted = true
            },
            { once: true }
          )
          const result = originalFetch(input, init)
          result.finally(() => {
            request.settled = true
          })
          return result
        }
        return originalFetch(input, init)
      }
    })

    const originalSource = await next.readFile('app/page.tsx')
    await next.patchFile(
      'app/page.tsx',
      originalSource
        .replace('const delayMs = 0', 'const delayMs = 1000')
        .replace("const marker = 'initial'", "const marker = 'slow'")
    )
    await retry(async () => {
      expect(
        await browser.eval(() => (window as any).__hmrRscRequests.length)
      ).toBe(1)
    })

    await next.patchFile(
      'app/page.tsx',
      originalSource.replace(
        "const marker = 'initial'",
        "const marker = 'latest'"
      )
    )
    await retry(async () => {
      expect(
        await browser.eval(() => (window as any).__hmrRscRequests.length)
      ).toBeGreaterThanOrEqual(2)
    })
    await retry(async () => {
      expect(
        await browser.eval(() => (window as any).__hmrRscRequests[0]?.settled)
      ).toBe(true)
    })

    expect(
      await browser.eval(() => (window as any).__hmrRscRequests[0].aborted)
    ).toBe(false)
    expect(
      await browser.eval(() => (window as any).__hmrRscRequests.at(-1)?.settled)
    ).toBe(true)

    await next.stop()
  })
})
