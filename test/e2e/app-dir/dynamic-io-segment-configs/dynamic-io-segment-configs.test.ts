import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

describe('dynamic-io-segment-configs', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
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

    if (isNextDev) {
      const browser = await next.browser('/revalidate')
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      const redbox = {
        description: await getRedboxDescription(browser),
        source: await getRedboxSource(browser),
      }

      expect(redbox.description).toMatchInlineSnapshot(`"Failed to compile"`)
      expect(redbox.source).toContain(
        '"revalidate" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
      )
    } else {
      expect(next.cliOutput).toContain('./app/dynamic-params/[slug]/page.tsx')
      expect(next.cliOutput).toContain(
        '"dynamicParams" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
      )
      expect(next.cliOutput).toContain('./app/dynamic/nested/page.tsx')
      expect(next.cliOutput).toContain('./app/dynamic/page.tsx')
      expect(next.cliOutput).toContain(
        '"dynamic" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
      )

      expect(next.cliOutput).toContain('./app/fetch-cache/page.tsx')
      expect(next.cliOutput).toContain(
        '"fetchCache" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
      )

      expect(next.cliOutput).toContain('./app/revalidate/page.tsx')
      expect(next.cliOutput).toContain(
        '"revalidate" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
      )
    }
  })

  it('should propagate configurations from layouts to pages', async () => {
    // patch the root layout. We expect the "dynamic" segment config to now be part of
    // each sub-page that uses this layout.
    await next.patchFile(
      'app/layout.tsx',
      (content) => {
        return `
          export const runtime = 'nodejs';
          ${content}
        `
      },
      async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }

        if (isNextDev) {
          const browser = await next.browser('/revalidate')
          await assertHasRedbox(browser, { pageResponseCode: 500 })
          const redbox = {
            description: await getRedboxDescription(browser),
            source: await getRedboxSource(browser),
          }

          expect(redbox.description).toMatchInlineSnapshot(
            `"Failed to compile"`
          )
          expect(redbox.source).toContain(
            '"runtime" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
          )
        } else {
          await retry(async () => {
            expect(next.cliOutput).toContain(
              '"runtime" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
            )

            // the stack trace is different between turbopack/webpack
            if (isTurbopack) {
              expectLinesToAppearTogether(next.cliOutput, [
                `Page: {"type":"app","side":"server","page":"/fetch-cache/page"}`,
                './app/layout.tsx:2:24',
              ])
            } else {
              expectLinesToAppearTogether(next.cliOutput, [
                'Import trace for requested module:',
                './app/fetch-cache/page.tsx',
                './app/layout.tsx',
              ])
            }
          })
        }
      }
    )
  })
})

function expectLinesToAppearTogether(output: string, lines: string[]) {
  const escapedLines = lines.map((line) =>
    line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = new RegExp(escapedLines.join('\\s*'), 's')
  expect(output).toMatch(pattern)
}
