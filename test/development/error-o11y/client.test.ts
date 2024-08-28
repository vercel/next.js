import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
  getRedboxHeader,
  getRedboxCallStack,
  getRedboxTotalErrorCount,
} from 'next-test-utils'

describe('error o11y in client component', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should show error o11y in client component app code', async () => {
    const browser = await next.browser('/client/app-code')

    await assertHasRedbox(browser)

    const redbox = {
      totalCount: await getRedboxTotalErrorCount(browser),
      header: await getRedboxHeader(browser),
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
      callStack: await getRedboxCallStack(browser),
    }

    expect(redbox.totalCount).toMatchInlineSnapshot(`1`)
    expect(redbox.header).toMatchInlineSnapshot(`
      "1 of 1 error
      Next.js (15.0.0-canary.132)
      Unhandled Runtime Error

      Error: runtime error in client component app code"
    `)
    expect(redbox.description).toMatchInlineSnapshot(
      `"Error: runtime error in client component app code"`
    )
    expect(redbox.source).toMatchInlineSnapshot(`
      "app/client/app-code/page.tsx (4:9) @ Error

        2 |
        3 | if ('window' in global) {
      > 4 |   throw Error('runtime error in client component app code')
          |         ^
        5 | }
        6 |
        7 | export default function Page() {"
    `)
    expect(redbox.callStack).toMatchInlineSnapshot(`
      "(app-pages-browser)/./app/client/app-code/page.tsx
      file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-acd139644b334b0a2d1ad3895030c9c7fe3aab37e06eea1f5db3ba08042a7b54/.next/static/chunks/app/client/app-code/page.js (28:1)
      options.factory
      file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-acd139644b334b0a2d1ad3895030c9c7fe3aab37e06eea1f5db3ba08042a7b54/.next/static/chunks/webpack.js (701:31)

      fn
      file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-acd139644b334b0a2d1ad3895030c9c7fe3aab37e06eea1f5db3ba08042a7b54/.next/static/chunks/webpack.js (357:21)"
    `)
  })
})
