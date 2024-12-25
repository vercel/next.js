import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getStackFramesContent } from 'next-test-utils'
import { outdent } from 'outdent'

describe('errors - anonymous-stack-frame', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': outdent`
      export default function Page() {
        [1, 2, 3].map(() => {
          throw new Error("anonymous error!");
        })
      }`,
    },
  })

  // TODO: hide the anonymous frames between 2 ignored frames
  test('should show anonymous frames from stack trace', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)
    expect(stack).toMatchInlineSnapshot(`
     "at Array.map ()
     at Page (pages/index.js (2:13))"
    `)
  })
})
