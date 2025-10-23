/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

const initialFiles = new Map([
  ['app/_.js', ''], // app dir need to exists, otherwise the SWC RSC checks will not run
  [
    'pages/index.js',
    outdent`
      export default function Page() { 
        return <div>Hello</div> 
      }
    `,
  ],
])

describe('Error for "use server" directive in Pages Router', () => {
  const { next } = nextTestSetup({
    files: {},
    skipStart: true,
  })

  test('"use server" directive is not allowed in Pages Router', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ...initialFiles,
        [
          'pages/test-page.js',
          outdent`
            "use server"

            export default function Page() {
              return <div>Hello</div>
            }
          `,
        ],
      ])
    )
    const { session } = sandbox

    await session.assertHasRedbox()
    await expect(session.getRedboxSource()).resolves.toMatch(
      /cannot use "use server" directive.*Server Actions are only supported in the App Router/
    )
  })

  test('"use client" directive is allowed in Pages Router', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ...initialFiles,
        [
          'pages/test-page.js',
          outdent`
            "use client"

            export default function Page() {
              return <div>Hello</div>
            }
          `,
        ],
      ])
    )
    const { session, browser } = sandbox

    // Should not have a redbox - "use client" is allowed
    await session.assertNoRedbox()

    const text = await browser.elementByCss('body').text()
    expect(text).toContain('Hello')
  })

  test('Pages Router pages without directives work correctly', async () => {
    await using sandbox = await createSandbox(next, initialFiles)
    const { session, browser } = sandbox

    await session.assertNoRedbox()

    const text = await browser.elementByCss('body').text()
    expect(text).toContain('Hello')
  })
})
