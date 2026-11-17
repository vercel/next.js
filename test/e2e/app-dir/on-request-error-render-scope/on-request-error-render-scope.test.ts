import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { NextDeployInstance } from '../../../lib/next-modes/next-deploy'

describe.each([false, true])(
  'onRequestError with partialPrefetching: %s',
  (partialPrefetching) => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents: true,
        partialPrefetching,
      },
    })

    it.each([
      ['rsc', 'react-server-components'],
      ['ssr', 'server-rendering'],
    ])(
      'allows async error reporting for %s errors',
      async (slug, renderSource) => {
        const since = new Date()
        const outputIndex = next.cliOutput.length
        const deadline = Date.now() + 50_000
        const response = await next.fetch(`/${slug}`)
        await response.text()

        await retry(
          async () => {
            const output = isNextDeploy
              ? await (next as NextDeployInstance).getRuntimeLogs({
                  since,
                  deadline,
                })
              : next.cliOutput.slice(outputIndex)
            const reports = [
              ...output.matchAll(/ERROR_REPORT:(\{[^\n]+\})/g),
            ].map((match) => JSON.parse(match[1]))
            expect(reports).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  message: `original-${slug}-error`,
                  path: `/${slug}`,
                  renderSource,
                  before: expect.any(Number),
                  after: expect.any(Number),
                  date: expect.any(String),
                  random: expect.any(Number),
                }),
              ])
            )
            expect(output).not.toContain('encountered the unstable value')
            expect(output).not.toContain(
              'Error in instrumentation.onRequestError'
            )
          },
          isNextDeploy ? 50_000 : 5000
        )
      }
    )
  }
)
