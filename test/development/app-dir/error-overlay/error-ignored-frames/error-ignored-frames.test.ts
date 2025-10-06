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

  it('should be able to collapse ignored frames in server component', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(`"at Page (app/page.tsx (2:9))"`)

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getStackFramesContent(browser)
    const ignoreListedStack = expandedStack.replace(defaultStack, '')
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack.trim()).toMatch(/at .*/)
  })

  it('should be able to collapse ignored frames in client component', async () => {
    const browser = await next.browser('/client')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(
      `"at Page (app/client/page.tsx (4:9))"`
    )

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getStackFramesContent(browser)
    const ignoreListedStack = expandedStack.replace(defaultStack, '')
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack.trim()).toMatch(/at .*/)
  })

  it('should be able to collapse ignored frames in interleaved call stack', async () => {
    const browser = await next.browser('/interleaved')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    if (isTurbopack) {
      expect(defaultStack).toMatchInlineSnapshot(`
       "at <unknown> (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:36))"
      `)
    } else {
      expect(defaultStack).toMatchInlineSnapshot(`
       "at eval (app/interleaved/page.tsx (7:11))
       at Page (app/interleaved/page.tsx (6:36))"
      `)
    }

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getStackFramesContent(browser)
    const ignoreListedStack = expandedStack.replace(defaultStack, '')
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack.trim()).toMatch(/at .*/)
  })

  it('should be able to collapse pages router ignored frames', async () => {
    const browser = await next.browser('/pages')
    await assertHasRedbox(browser)

    const defaultStack = await getStackFramesContent(browser)
    expect(defaultStack).toMatchInlineSnapshot(
      `"at Page (pages/pages.tsx (2:9))"`
    )

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getStackFramesContent(browser)
    const ignoreListedStack = expandedStack.replace(defaultStack, '')
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack.trim()).toMatch(/at .*/)
  })
})
