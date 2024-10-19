import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic-io-segment-configs', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it("it should error when using segment configs that aren't supported by dynamicIO", async () => {
    try {
      await next.start()
    } catch {
      // we expect the build to fail
    }

    expect(next.cliOutput).toContain(
      'The following pages used segment configs which are not supported with "experimental.dynamicIO"'
    )
    expect(next.cliOutput).toContain('/runtime: runtime')
    expect(next.cliOutput).toContain('/multiple: dynamic, fetchCache, runtime')
    expect(next.cliOutput).toContain('/dynamic/nested: dynamic')
    expect(next.cliOutput).toContain('/dynamic-params/[slug]: dynamicParams')
    expect(next.cliOutput).toContain('/fetch-cache: fetchCache')
    expect(next.cliOutput).toContain('/dynamic: dynamic')
    expect(next.cliOutput).toContain('/revalidate: revalidate')
  })

  it('should propagate configurations from layouts to pages', async () => {
    // patch the root layout. We expect the "dynamic" segment config to now be part of
    // each sub-page that uses this layout.
    await next.patchFile(
      'app/layout.tsx',
      (content) => {
        return `
          export const dynamic = 'force-dynamic';
          ${content}
        `
      },
      async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }

        await retry(async () => {
          expect(next.cliOutput).toContain(
            'The following pages used segment configs which are not supported with "experimental.dynamicIO"'
          )
          expect(next.cliOutput).toContain('/runtime: dynamic, runtime')
          expect(next.cliOutput).toContain(
            '/multiple: dynamic, fetchCache, runtime'
          )
          expect(next.cliOutput).toContain('/dynamic/nested: dynamic')
          expect(next.cliOutput).toContain(
            '/dynamic-params/[slug]: dynamic, dynamicParams'
          )
          expect(next.cliOutput).toContain('/fetch-cache: dynamic, fetchCache')
          expect(next.cliOutput).toContain('/dynamic: dynamic')
          expect(next.cliOutput).toContain('/revalidate: dynamic, revalidate')
        })
      }
    )
  })
})
