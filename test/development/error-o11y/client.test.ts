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
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should display error o11y for client component app code in Turbopack', async () => {
    const browser = await next.browser('/client/app-code')

    await assertHasRedbox(browser)

    const redbox = {
      category: await getRedboxCategory(browser),
      description: await getRedboxDescription(browser),
      location: await getRedboxLocation(browser),
      codeFrame: await getRedboxCodeFrame(browser),
      callStack: await getRedboxCallStack(browser),
    }

    if (isTurbopack) {
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
      // expect(redbox.callStack).toMatchInlineSnapshot(``)
    } else {
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
      // expect(redbox.callStack).toMatchInlineSnapshot(``)
    }
  })
})
