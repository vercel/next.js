import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  getRedboxCallStack,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'

describe('error-ignored-frames', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to collapse ignored frames in server component', async () => {
    const browser = await next.browser('/')
    await waitForRedbox(browser)

    const defaultStack = await getRedboxCallStack(browser)
    expect(defaultStack).toMatchInlineSnapshot(`
     [
       "Page app/page.tsx (2:9)",
     ]
    `)

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getRedboxCallStack(browser)
    const ignoreListedStack = expandedStack.filter(
      (line) => !defaultStack.includes(line)
    )
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack).not.toHaveLength(0)
  })

  it('should be able to collapse ignored frames in client component', async () => {
    const browser = await next.browser('/client')
    await waitForRedbox(browser)

    const defaultStack = await getRedboxCallStack(browser)
    expect(defaultStack).toMatchInlineSnapshot(`
     [
       "Page app/client/page.tsx (4:9)",
     ]
    `)

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getRedboxCallStack(browser)
    const ignoreListedStack = expandedStack.filter(
      (line) => !defaultStack.includes(line)
    )
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack).not.toHaveLength(0)
  })

  it('should be able to collapse ignored frames in interleaved call stack', async () => {
    const browser = await next.browser('/interleaved')
    await waitForRedbox(browser)

    const defaultStack = await getRedboxCallStack(browser)
    if (isTurbopack) {
      expect(defaultStack).toMatchInlineSnapshot(`
       [
         "<unknown> app/interleaved/page.tsx (7:11)",
         "Page app/interleaved/page.tsx (6:36)",
       ]
      `)
    } else {
      expect(defaultStack).toMatchInlineSnapshot(`
       [
         "eval app/interleaved/page.tsx (7:11)",
         "Page app/interleaved/page.tsx (6:36)",
       ]
      `)
    }

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getRedboxCallStack(browser)
    const ignoreListedStack = expandedStack.filter(
      (line) => !defaultStack.includes(line)
    )
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack).not.toHaveLength(0)
  })

  it('should be able to collapse pages router ignored frames', async () => {
    const browser = await next.browser('/pages')
    await waitForRedbox(browser)

    const defaultStack = await getRedboxCallStack(browser)
    expect(defaultStack).toMatchInlineSnapshot(`
     [
       "Page pages/pages.tsx (2:9)",
     ]
    `)

    await toggleCollapseCallStackFrames(browser)

    const expandedStack = await getRedboxCallStack(browser)
    const ignoreListedStack = expandedStack.filter(
      (line) => !defaultStack.includes(line)
    )
    // We don't care about the exact stack trace that was ignore-listed.
    // It'll contain implementation details that may change and
    // shouldn't break this test.
    expect(ignoreListedStack).not.toHaveLength(0)
  })
})
