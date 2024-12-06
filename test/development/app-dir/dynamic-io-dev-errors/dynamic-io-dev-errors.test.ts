import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  hasErrorToast,
  retry,
  openRedbox,
  getRedboxSource,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Dynamic IO Dev Errors', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should show a red box error on the SSR render', async () => {
    const browser = await next.browser('/error')

    await openRedbox(browser)

    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
      `"[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
    )
  })

  it('should show a red box error on client navigations', async () => {
    const browser = await next.browser('/no-error')

    expect(await hasErrorToast(browser)).toBe(false)

    await browser.elementByCss("[href='/error']").click()

    await openRedbox(browser)

    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
      `"[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
    )
  })

  // NOTE: when update this snapshot, use `pnpm build` in packages/next to avoid next source code get mapped to source.
  it('should display error when component accessed data without suspense boundary', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/no-accessed-data')

    await openRedbox(browser)

    expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(
      `\nError: Route "/no-accessed-data": ` +
        `A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. ` +
        `We don't have the exact line number added to error messages yet but you can see which component in the stack below. ` +
        `See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense` +
        '\n    at Page [Server] (<anonymous>)' +
        (isTurbopack
          ? '\n    at main (<anonymous>)' +
            '\n    at body (<anonymous>)' +
            '\n    at html (<anonymous>)' +
            '\n    at Root [Server] (<anonymous>)'
          : // TODO(veil): Should be ignore-listed (see https://linear.app/vercel/issue/NDX-464/next-internals-not-ignore-listed-in-terminal-in-webpack#comment-1164a36a)
            '\n    at parallelRouterKey (..')
    )

    const description = await getRedboxDescription(browser)

    expect(description).toMatchInlineSnapshot(
      `"[ Server ] Error: Route "/no-accessed-data": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense"`
    )

    // Expand the stack frames, since the first frame `Page [Server] <anonymous>` is treated as ignored.
    // TODO: Remove the filter of anonymous frames when we have a better way to handle them.
    await toggleCollapseCallStackFrames(browser)
    const stack = await getRedboxCallStack(browser)
    // TODO: use snapshot testing for stack
    // FIXME: avoid `next` code to be mapped to source code and filter them out even when sourcemap is enabled.
    expect(stack).toContain('Page [Server]')
    expect(stack).toContain('Root [Server]')
    expect(stack).toContain('<anonymous> (2:1)')
  })

  it('should clear segment errors after correcting them', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.tsx',
          outdent`
          export const revalidate = 10
          export default function Page() {
            return (
              <div>Hello World</div>
            );
          }
        `,
        ],
      ])
    )
    const { browser, session } = sandbox
    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }

    expect(redbox.description).toMatchInlineSnapshot(`"Failed to compile"`)
    expect(redbox.source).toContain(
      '"revalidate" is not compatible with `nextConfig.experimental.dynamicIO`. Please remove it.'
    )

    await session.patch(
      'app/page.tsx',
      outdent`
      export default function Page() {
        return (
          <div>Hello World</div>
        );
      }
    `
    )

    await retry(async () => {
      assertNoRedbox(browser)
    })
  })
})
