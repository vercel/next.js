import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('document-vendor-chunk-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'doc-only-pkg': 'file:./doc-only-pkg',
      'shared-pkg': 'file:./shared-pkg',
    },
    nextConfig: {
      // Bundle both packages so they get their own server vendor chunks.
      transpilePackages: ['doc-only-pkg', 'shared-pkg'],
    },
  })

  it('should not reload the page when a new server entry reorders the vendor chunks of _document', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__noReload = true')

    // Compiles a new server entry that shares a vendor chunk with _document.
    const res = await next.fetch('/api/hello')
    expect(await res.json()).toEqual({ shared: 'shared' })

    // Wait for an unrelated edit to apply, so a reload sent for the API route
    // compilation has already happened.
    await next.patchFile('pages/index.tsx', (content) =>
      content!.replace('hello world', 'hello again')
    )
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('hello again')
    })
    expect(await browser.eval('window.__noReload')).toBe(true)
  })

  it('should reload the page when _document changes', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__noReload = true')

    await next.patchFile(
      'pages/_document.tsx',
      (content) =>
        content!.replace(
          'data-shared={shared}',
          'data-shared={shared} data-edited'
        ),
      async () => {
        await retry(async () => {
          expect(
            await browser.eval(
              'document.documentElement.hasAttribute("data-edited")'
            )
          ).toBe(true)
        })
        expect(await browser.eval('window.__noReload')).toBeUndefined()
      }
    )
  })
})
