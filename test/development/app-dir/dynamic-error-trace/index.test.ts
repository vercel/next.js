import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'
import { outdent } from 'outdent'

function normalizeStackTrace(trace) {
  return trace.replace(/ \(.*\)/g, '')
}

describe('app dir - dynamic error trace', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should show the error trace', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    await expect(
      browser.hasElementByCssSelector(
        '[data-nextjs-data-runtime-error-collapsed-action]'
      )
    ).resolves.toEqual(false)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFramesContent = // TODO: Why is this text empty?
      (await Promise.all(stackFrameElements.map((f) => f.innerText())))
        // Filter out the frames having code snippet but without methodName and source
        .filter(Boolean)
        .join('\n')

    // TODO: Show useful stack
    const normalizedStack = normalizeStackTrace(stackFramesContent)
    expect(normalizedStack).toMatchInlineSnapshot(`""`)

    const codeframe = await getRedboxSource(browser)
    expect(codeframe).toEqual(
      process.env.TURBOPACK
        ? outdent`
            app/lib.js (4:13) @ Foo
            
              2 |
              3 | export function Foo() {
            > 4 |   useHeaders()
                |             ^
              5 |   return 'foo'
              6 | }
              7 |
          `
        : // TODO: should be "@ Foo" since that's where we put the codeframe and print the source location
          outdent`
            app/lib.js (4:13) @ useHeaders

              2 |
              3 | export function Foo() {
            > 4 |   useHeaders()
                |             ^
              5 |   return 'foo'
              6 | }
              7 |
          `
    )
  })
})
