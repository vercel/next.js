import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'

describe('segment cache - unstable_staleTime with cacheComponents', () => {
  // TODO: Specify behavior for how unstable_staleTime should behave with cacheComponents pages
})

describe('segment cache - unstable_staleTime with cacheComponents - build-time validations', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error when both unstable_staleTime and unstable_instant are used in a page', async () => {
    await next.patchFile(
      'app/page.tsx',
      outdent`
        export const unstable_staleTime = 300
        export const unstable_instant = { prefetch: 'static' }

        export default function Page() {
          return <p>Page with both unstable_staleTime and unstable_instant</p>
        }
      `,
      async () => {
        try {
          await next.start()
        } catch {
          // we expect the build/start to fail
        }

        if (isNextDev) {
          // In dev mode, we need to trigger the compilation by visiting the page
          await next.fetch('/')
        }

        await retry(async () => {
          expect(next.cliOutput).toContain(
            'cannot use `unstable_staleTime` and `unstable_instant` together'
          )
        })
      }
    )
  })
})
