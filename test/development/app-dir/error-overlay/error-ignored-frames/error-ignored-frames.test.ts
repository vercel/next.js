import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
  getRedboxSource,
} from 'next-test-utils'

describe('error-ignored-frames', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should update codeframe when clicking on a different stack frame', async () => {
    const browser = await next.browser('/interleaved')
    await waitForRedbox(browser)

    // Initially, the first non-ignored frame with codeframe should be selected
    const initialSource = await getRedboxSource(browser)
    expect(initialSource).toContain('app/interleaved/page.tsx')

    // Get the initially selected frame to verify it changes
    const initialSelectedFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const initialFrameText = await initialSelectedFrame.text()

    // Get all selectable frames (frames with select buttons)
    const selectableFrames = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame-selectable="true"]'
    )
    // Should have at least 2 selectable frames
    expect(selectableFrames.length).toBeGreaterThanOrEqual(2)

    // Click on a different selectable frame to change selection
    // Using the select button which covers the whole frame area
    const secondFrameButton = await browser.elementByCss(
      '[data-nextjs-call-stack-frame-selectable="true"]:not([data-nextjs-call-stack-frame][aria-selected="true"]) .call-stack-frame-select-button'
    )
    await secondFrameButton.click()

    // The selected frame should have changed
    const newSelectedFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const newFrameText = await newSelectedFrame.text()
    expect(newFrameText).not.toBe(initialFrameText)

    // The codeframe should still show content from the interleaved page
    const newSource = await getRedboxSource(browser)
    expect(newSource).toContain('app/interleaved/page.tsx')
  })

  it('should be able to collapse ignored frames in server component', async () => {
    const browser = await next.browser('/')
    await waitForRedbox(browser)

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
    await waitForRedbox(browser)

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
    await waitForRedbox(browser)

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
    await waitForRedbox(browser)

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

  it('should navigate call stack frames with keyboard', async () => {
    const browser = await next.browser('/interleaved')
    await waitForRedbox(browser)

    // Click the selected frame to ensure focus is in the call stack
    const initialFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const initialIndex = await initialFrame.getAttribute(
      'data-nextjs-call-stack-frame-index'
    )
    await initialFrame.click()

    // Press ArrowDown to move to the next frame
    await browser.keydown('ArrowDown')
    await browser.keyup('ArrowDown')

    const afterDownFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const afterDownIndex = await afterDownFrame.getAttribute(
      'data-nextjs-call-stack-frame-index'
    )
    expect(afterDownIndex).not.toBe(initialIndex)

    // The code frame should still show relevant source
    const source = await getRedboxSource(browser)
    expect(source).toContain('app/interleaved/page.tsx')

    // Press ArrowUp to move back
    await browser.keydown('ArrowUp')
    await browser.keyup('ArrowUp')

    const afterUpFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const afterUpIndex = await afterUpFrame.getAttribute(
      'data-nextjs-call-stack-frame-index'
    )
    expect(afterUpIndex).toBe(initialIndex)

    // Press End to jump to the last frame, then Home to jump to the first
    await browser.keydown('End')
    await browser.keyup('End')

    const endFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const endIndex = await endFrame.getAttribute(
      'data-nextjs-call-stack-frame-index'
    )

    await browser.keydown('Home')
    await browser.keyup('Home')

    const homeFrame = await browser.elementByCss(
      '[data-nextjs-call-stack-frame][aria-selected="true"]'
    )
    const homeIndex = await homeFrame.getAttribute(
      'data-nextjs-call-stack-frame-index'
    )

    expect(Number(homeIndex)).toBeLessThan(Number(endIndex))
  })
})
