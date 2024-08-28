import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxCallStack,
  getRedboxCategory,
  getRedboxLocation,
  getRedboxCodeFrame,
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
      category: await getRedboxCategory(browser),
      description: await getRedboxDescription(browser),
      location: await getRedboxLocation(browser),
      codeFrame: await getRedboxCodeFrame(browser),
      callStack: await getRedboxCallStack(browser),
    }

    expect(redbox.category).toMatchInlineSnapshot(`"Unhandled Runtime Error"`)

    expect(redbox.description).toMatchInlineSnapshot(
      `"Error: runtime error in client component app code"`
    )

    expect(redbox.location).toMatchInlineSnapshot(
      `"app/client/app-code/page.tsx (4:9) @ Error"`
    )

    expect(redbox.codeFrame).toMatchInlineSnapshot(`
      "  2 |
        3 | if ('window' in global) {
      > 4 |   throw Error('runtime error in client component app code')
          |         ^
        5 | }
        6 |
        7 | export default function Page() {"
    `)

    // TODO: The callstack file path may vary.
    // expect(redbox.callStack).toMatchInlineSnapshot(`
    //   "(app-pages-browser)/./app/client/app-code/page.tsx
    //   file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-142db730f4a6eb59d36e7f6096d3d4d65a2b9dddcaf5dac2bac1cbad0f3ff5b4/.next/static/chunks/app/client/app-code/page.js (28:1)
    //   options.factory
    //   file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-142db730f4a6eb59d36e7f6096d3d4d65a2b9dddcaf5dac2bac1cbad0f3ff5b4/.next/static/chunks/webpack.js (701:31)

    //   fn
    //   file:///private/var/folders/cm/328vyfy92k194zkm0jpl5sqw0000gn/T/next-install-142db730f4a6eb59d36e7f6096d3d4d65a2b9dddcaf5dac2bac1cbad0f3ff5b4/.next/static/chunks/webpack.js (357:21)"
    // `)
  })
})
