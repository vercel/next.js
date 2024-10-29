import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  hasErrorToast,
  retry,
  waitForAndOpenRuntimeError,
  getRedboxSource,
} from 'next-test-utils'
import { sandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Dynamic IO Dev Errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should show a red box error on the SSR render', async () => {
    const browser = await next.browser('/error')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)

      await waitForAndOpenRuntimeError(browser)

      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
      )
    })
  })

  it('should show a red box error on client navigations', async () => {
    const browser = await next.browser('/no-error')

    expect(await hasErrorToast(browser)).toBe(false)

    await browser.elementByCss("[href='/error']").click()

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)

      await waitForAndOpenRuntimeError(browser)

      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random"`
      )
    })
  })

  // NOTE: when update this snapshot, use `pnpm build` in packages/next to avoid next source code get mapped to source.
  it('should display error when component accessed data without suspense boundary', async () => {
    const browser = await next.browser('/no-accessed-data')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(true)
      await waitForAndOpenRuntimeError(browser)
      await assertHasRedbox(browser)
    })

    const description = await getRedboxDescription(browser)
    const stack = await getRedboxCallStack(browser)

    expect(description).toMatchInlineSnapshot(
      `"[ Server ] Error: Route "/no-accessed-data": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense"`
    )
    // TODO: use snapshot testing for stack
    // FIXME: avoid `next` code to be mapped to source code and filter them out even when sourcemap is enabled.
    expect(stack).toContain('Page [Server]')
    expect(stack).toContain('Root [Server]')
    expect(stack).toContain('<anonymous> (2:1)')
  })

  // `setHmrServerError` is not currently implemented in Turbopack
  // we will need to enable this after it gets implemented.
  if (!isTurbopack) {
    it('should clear segment errors after correcting them', async () => {
      const { cleanup, session, browser } = await sandbox(
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

      await assertHasRedbox(browser)
      const redbox = {
        description: await getRedboxDescription(browser),
        source: await getRedboxSource(browser),
      }

      expect(redbox.description).toMatchInlineSnapshot(`"Failed to compile"`)
      expect(redbox.source).toMatchInlineSnapshot(`
      "The following pages used segment configs which are not supported with "experimental.dynamicIO" and must be removed to build your application:
      /: revalidate"
    `)

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

      await cleanup()
    })
  }
})
