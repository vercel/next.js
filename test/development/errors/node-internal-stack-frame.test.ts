import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'
import { outdent } from 'outdent'

describe('errors - node-internal-stack-frame', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': outdent`
      export default function Page() {}
      
      function createURL() {
        new URL("/", "invalid")
      }

      export function getServerSideProps() {
        createURL()
        return { props: {} }
      }`,
    },
  })

  test('should hide nodejs internal stack frames from stack trace', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)
    expect(stack).toMatchInlineSnapshot(
      `"at getServerSideProps (pages/index.js (8:3))"`
    )

    await toggleCollapseCallStackFrames(browser)
    const stackCollapsed = await getStackFramesContent(browser)
    expect(stackCollapsed).toContain('at new URL ()')
  })
})
