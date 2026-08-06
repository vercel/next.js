import { nextTestSetup } from 'e2e-utils'
import { openRedbox, retry } from 'next-test-utils'
import {
  createRedboxSnapshot,
  type ErrorSnapshot,
} from '../../lib/add-redbox-matchers'

describe('Link with legacyBehavior', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return it('should skip', () => {})
  }

  describe('if the child is an <a> tag', () => {
    it('forwards the href attribute', async () => {
      const $ = await next.render$('/')
      const $a = $('a[href="/about"]')

      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    })

    it('navigates correctly', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('a[href="/about"]').click()
      const title = await browser.elementByCss('#about-page').text()

      expect(title).toBe('About Page')
    })
  })

  it('works if the child is a number', async () => {
    const browser = await next.browser('/child-is-a-number')
    await browser.elementByCss('a[href="/about"]').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('works if the child is a string', async () => {
    const browser = await next.browser('/child-is-a-string')
    await browser.elementByCss('a[href="/about"]').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('errors when calling onClick without the event', async () => {
    const browser = await next.browser('/invalid-onclick')
    expect(await browser.elementByCss('#errors').text()).toBe('0')
    await browser.elementByCss('#custom-button').click()
    expect(await browser.elementByCss('#errors').text()).toBe('1')
  })

  it('should show a deprecation warning', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const logs = await browser.log()
      const errors = logs.filter((log) => log.source === 'error')

      if (isNextDev) {
        expect(errors).toEqual([
          {
            message:
              '`legacyBehavior` is deprecated and will be removed in a future release. A codemod is available to upgrade your components:\n\n' +
              'npx @next/codemod@latest new-link .\n\n' +
              'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components',
            source: 'error',
          },
        ])
      } else {
        expect(errors).toEqual([])
      }
    })
  })

  describe('passHref', () => {
    const expectHrefToBeForwardedInSSR = async (path: string) => {
      const $ = await next.render$(path)
      const $a = $('a[href="/about"]')
      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    }

    const expectLinkClickToNavigate = async (path: string) => {
      const browser = await next.browser(path)

      if (isNextDev) {
        // We expect a deprecation warning (in a collapsed redbox), but no other errors (e.g. no errors thrown by Link)
        await openRedbox(browser)
        expect(await createRedboxSnapshot(browser, next)).toEqual(
          expect.objectContaining<Partial<ErrorSnapshot>>({
            label: 'Console Error',
            description: expect.stringContaining(
              `\`legacyBehavior\` is deprecated and will be removed in a future release.`
            ),
          })
        )
        await browser.locateRedbox().press('Escape') // Close redbox so we can click the link
      }

      await browser.elementByCss('a[href="/about"]').click()

      const title = await browser.elementByCss('h1').text()
      expect(title).toBe('About Page')
    }

    describe('with no prefech config', () => {
      it('forwards the href attribute', async () => {
        await expectHrefToBeForwardedInSSR('/passHref/default')
      })

      it('navigates correctly (failing)', async () => {
        if (isNextDev) {
          // FIXME(NAR-876): false positive due to debug info blocking the child
          // await expectLinkClickToNavigate('/passHref/default')

          const browser = await next.browser('/passHref/default')
          await expect(browser).toDisplayRedbox(`
           {
             "code": "E863",
             "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "app/passHref/default/page.tsx (7:7) @ Page
           >  7 |       <Link href="/about" legacyBehavior passHref>
                |       ^",
             "stack": [
               "Page app/passHref/default/page.tsx (7:7)",
             ],
           }
          `)
        } else {
          await expectLinkClickToNavigate('/passHref/default')
        }
      })
    })

    describe('with runtime prefetch', () => {
      it('forwards the href attribute', async () => {
        await expectHrefToBeForwardedInSSR('/passHref/runtime')
      })

      it('navigates correctly (failing)', async () => {
        if (isNextDev) {
          // FIXME(NAR-876): false positive due to debug info blocking the child
          // await expectLinkClickToNavigate('/passHref/runtime')

          const browser = await next.browser('/passHref/runtime')
          await expect(browser).toDisplayRedbox(`
           {
             "code": "E863",
             "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "app/passHref/runtime/page.tsx (9:7) @ Page
           >  9 |       <Link href="/about" legacyBehavior passHref>
                |       ^",
             "stack": [
               "Page app/passHref/runtime/page.tsx (9:7)",
             ],
           }
          `)
        } else {
          await expectLinkClickToNavigate('/passHref/runtime')
        }
      })
    })

    describe('in dynamic code', () => {
      it('forwards the href attribute', async () => {
        await expectHrefToBeForwardedInSSR('/passHref/dynamic')
      })

      it('navigates correctly', async () => {
        await expectLinkClickToNavigate('/passHref/dynamic')
      })
    })
  })
})
