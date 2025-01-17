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

  if (
    // TODO: remove this when reactOwnerStack is enabled by default
    // Since PPR mode is just going to add owner stack, skip this test for now
    process.env.__NEXT_EXPERIMENTAL_PPR === 'true' ||
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
    expect(defaultStack).toMatchInlineSnapshot(`""`)

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

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(`""`)

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at react-stack-bottom-frame ()
        at renderWithHooks ()
        at updateFunctionComponent ()
        at beginWork ()
        at runWithFiberInDEV ()
        at performUnitOfWork ()
        at workLoopSync ()
        at renderRootSync ()
        at performWorkOnRoot ()
        at performWorkOnRootViaSchedulerTask ()
        at MessagePort.performWorkUntilDeadline ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at react-stack-bottom-frame ()
        at renderWithHooks ()
        at updateFunctionComponent ()
        at beginWork ()
        at runWithFiberInDEV ()
        at performUnitOfWork ()
        at workLoopSync ()
        at renderRootSync ()
        at performWorkOnRoot ()
        at performWorkOnRootViaSchedulerTask ()
        at MessagePort.performWorkUntilDeadline ()"
      `)
    }
  })

  it('should be able to collapse ignored frames in interleaved call stack', async () => {
    const browser = await next.browser('/interleaved')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(defaultStack).toMatchInlineSnapshot(
        `"at Page (app/interleaved/page.tsx (6:35))"`
      )
    } else {
      expect(defaultStack).toMatchInlineSnapshot(
        `"at Page (app/interleaved/page.tsx (6:37))"`
      )
    }

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at invokeCallback ()
        at Page (app/interleaved/page.tsx (6:35))
        at react-stack-bottom-frame ()
        at renderWithHooks ()
        at updateFunctionComponent ()
        at beginWork ()
        at runWithFiberInDEV ()
        at performUnitOfWork ()
        at workLoopSync ()
        at renderRootSync ()
        at performWorkOnRoot ()
        at performWorkOnRootViaSchedulerTask ()
        at MessagePort.performWorkUntilDeadline ()"
      `)
    } else {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at invokeCallback (node_modules/interleave/index.js (2:1))
        at Page (app/interleaved/page.tsx (6:37))
        at react-stack-bottom-frame ()
        at renderWithHooks ()
        at updateFunctionComponent ()
        at beginWork ()
        at runWithFiberInDEV ()
        at performUnitOfWork ()
        at workLoopSync ()
        at renderRootSync ()
        at performWorkOnRoot ()
        at performWorkOnRootViaSchedulerTask ()
        at MessagePort.performWorkUntilDeadline ()"
      `)
    }
  })

  it('should be able to collapse pages router ignored frames', async () => {
    const browser = await next.browser('/pages')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(`""`)

    await toggleCollapseCallStackFrames(browser)

    const expendedStack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(expendedStack).toMatchInlineSnapshot(`
        "at react-stack-bottom-frame ()
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
        "at react-stack-bottom-frame ()
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
