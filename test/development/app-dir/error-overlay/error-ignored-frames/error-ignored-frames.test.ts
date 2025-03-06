import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'

describe('error-ignored-frames', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  if (
    // Skip react 18 test as the call stacks are different
    process.env.NEXT_TEST_REACT_VERSION === '18.3.1'
  ) {
    it('skip test', () => {})
    return
  }

  it('should be able to collapse ignored frames in server component', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(`"at Page (app/page.tsx (2:9))"`)

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (app/page.tsx (2:9))
       at resolveErrorDev ()
       at processFullStringRow ()
       at processFullBinaryRow ()
       at progress ()
       at InnerLayoutRouter ()
       at OuterLayoutRouter ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (app/page.tsx (2:9))
       at resolveErrorDev ()
       at processFullStringRow ()
       at processFullBinaryRow ()
       at progress ()
       at InnerLayoutRouter (../src/client/components/layout-router.tsx (408:5))
       at OuterLayoutRouter (../src/client/components/layout-router.tsx (607:19))"
      `)
    }
  })

  it('should be able to collapse ignored frames in client component', async () => {
    const browser = await next.browser('/client')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(
      `"at Page (app/client/page.tsx (4:9))"`
    )

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (app/client/page.tsx (4:9))
       at ClientPageRoot ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (app/client/page.tsx (4:9))
       at ClientPageRoot (../src/client/components/client-page.tsx (60:12))"
      `)
    }
  })

  it('should be able to collapse ignored frames in interleaved call stack', async () => {
    const browser = await next.browser('/interleaved')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(defaultStack).toMatchInlineSnapshot(`
       "at <unknown> (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:35))"
      `)
    } else {
      expect(defaultStack).toMatchInlineSnapshot(`
       "at eval (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:36))"
      `)
    }

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at <unknown> (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:35))
       at invokeCallback ()
       at ClientPageRoot ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at eval (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:36))
       at invokeCallback (node_modules/interleave/index.js (2:1))
       at ClientPageRoot (../src/client/components/client-page.tsx (60:12))"
      `)
    }
  })

  it('should be able to collapse pages router ignored frames', async () => {
    const browser = await next.browser('/pages')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(
      `"at Page (pages/pages.tsx (2:9))"`
    )

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (pages/pages.tsx (2:9))
       at react-stack-bottom-frame ()
       at renderWithHooks ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at finishFunctionComponent ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderNode ()
       at renderChildrenArray ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderNode ()
       at renderChildrenArray ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at finishFunctionComponent ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
       "at Page (pages/pages.tsx (2:9))
       at react-stack-bottom-frame ()
       at renderWithHooks ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at finishFunctionComponent ()
       at renderElement ()
       at retryNode ()
       at renderNodeDestructive ()
       at renderNode ()
       at renderChildrenArray ()"
      `)
    }
  })
})
