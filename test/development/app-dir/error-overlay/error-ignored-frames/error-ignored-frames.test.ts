import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'

describe('error-ignored-frames', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to collapse ignored frames in server component', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)

    if (process.env.TURBOPACK) {
      expect(stack).toMatchInlineSnapshot(`""`)
    } else {
      expect(stack).toMatchInlineSnapshot(`""`)
    }

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at resolveErrorDev ()
        at processFullStringRow ()
        at processFullBinaryRow ()
        at progress ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at resolveErrorDev ()
        at processFullStringRow ()
        at processFullBinaryRow ()
        at progress ()"
      `)
    }
  })

  it('should be able to collapse ignored frames in client component', async () => {
    const browser = await next.browser('/client')
    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)

    if (process.env.TURBOPACK) {
      expect(stack).toMatchInlineSnapshot(`""`)
    } else {
      expect(stack).toMatchInlineSnapshot(`""`)
    }

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at resolveErrorDev ()
        at processFullStringRow ()
        at processFullBinaryRow ()
        at progress ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at resolveErrorDev ()
        at processFullStringRow ()
        at processFullBinaryRow ()
        at progress ()"
      `)
    }
  })
})
