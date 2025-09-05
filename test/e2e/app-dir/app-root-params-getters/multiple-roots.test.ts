import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'
import { retry } from '../../../lib/next-test-utils'

describe('app-root-param-getters - multiple roots', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'multiple-roots'),
  })

  it('should have root params on dashboard pages', async () => {
    const $ = await next.render$('/dashboard/1')
    expect($('body').text()).toContain('Dashboard Root')
    expect($('p').text()).toBe(`hello world ${JSON.stringify({ id: '1' })}`)
  })

  it('should not have root params on marketing pages', async () => {
    const $ = await next.render$('/landing')
    expect($('body').text()).toContain('Marketing Root')
    expect($('p').text()).toBe('hello world {}')
  })

  if (isNextDev) {
    it('should add getters when new root layouts are added or renamed', async () => {
      // Start on the dashboard page, which uses root param getters.
      // This forces the bundler to generate 'next/root-params'.
      await using sandbox = await createSandbox(next, undefined, `/dashboard/1`)
      const { browser, session } = sandbox

      expect(await browser.elementByCss('p').text()).toBe(
        `hello world ${JSON.stringify({ id: '1' })}`
      )

      // Add a new root layout with a root param.
      // This should make the bundler re-generate 'next/root-params' with a new getter for `stuff`.
      const newRootLayoutFiles = new Map([
        [
          'app/new-root/[stuff]/layout.tsx',
          outdent`
            export default function Root({ children }) {
              return (
                <html>
                  <body>{children}</body>
                </html>
              )
            }
          `,
        ],
        [
          'app/new-root/[stuff]/page.tsx',
          // Note that we're also importing the `id` getter just to see if it's still there
          // (we expect it to return undefined, because we don't have that param on this route)
          outdent`
            import { id, stuff } from 'next/root-params'
            export default async function Page() {
              return (
                <p>hello new root: {JSON.stringify({ id: await id(), stuff: await stuff() })}</p>
              )
            }

            export async function generateStaticParams() {
              return [{ stuff: '123' }]
            }
          `,
        ],
      ])
      for (const [filePath, fileContent] of newRootLayoutFiles) {
        await session.write(filePath, fileContent)
      }

      // The page should call the getter and get the correct param value.
      await retry(async () => {
        const params = { stuff: '123' }
        await browser.get(new URL(`/new-root/${params.stuff}`, next.url).href)
        expect(await browser.elementByCss('p').text()).toBe(
          `hello new root: ${JSON.stringify(params)}`
        )
      })

      // Change the name of the root param
      // This should make the bundler re-generate 'next/root-params' again, with `things` instead of `stuff`.
      if (isTurbopack) {
        // FIXME(turbopack): Something in our routing logic doesn't handle renaming a route param in turbopack mode.
        // I haven't found the cause for this, but `DefaultRouteMatcherManager.reload` calls
        // `getSortedRoutes(['/dashboard/[id]', '/new-root/[stuff]', '/new-root/[things]'])`
        // which makes it error because it looks like we have two overlapping routes.
        // I'm not sure why the previous route doesn't get removed and couldn't find a workaround,
        // so we're skipping the rest of the test for now.
        return
      }
      await session.renameFolder(
        'app/new-root/[stuff]',
        'app/new-root/[things]'
      )

      // The page code we added should now be erroring, because the root param getter is called `things` now
      await retry(() => {
        expect(next.cliOutput).toContain(
          isTurbopack
            ? `Export stuff doesn't exist in target module`
            : `Attempted import error: 'stuff' is not exported from 'next/root-params' (imported as 'stuff').`
        )
      })

      // Update the page to use the new root param name
      await session.write(
        'app/new-root/[things]/page.tsx',
        outdent`
            import { id, things } from 'next/root-params'
            export default async function Page() {
              return (
                <p>hello new root: {JSON.stringify({ id: await id(), things: await things() })}</p>
              )
            }

            export async function generateStaticParams() {
              return [{ things: '123' }]
            }
          `
      )

      // The page should call the getter and get the correct param value.
      await retry(async () => {
        const params = { things: '123' }
        await browser.get(new URL(`/new-root/${params.things}`, next.url).href)
        expect(await browser.elementByCss('p').text()).toBe(
          `hello new root: ${JSON.stringify(params)}`
        )
      })
    })
  }
})
