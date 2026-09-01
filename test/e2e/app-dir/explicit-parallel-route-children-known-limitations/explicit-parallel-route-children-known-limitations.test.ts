import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('explicit-parallel-route-children-known-limitations', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function createBrowserWithAct(pathname: string) {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser(pathname, {
      beforePageLoad(page) {
        act = createRouterAct(page, {
          allowErrorStatusCodes: [401, 403, 404, 500],
        })
      },
    })

    return { act: act!, browser }
  }

  async function navigate(
    browser: Awaited<ReturnType<typeof next.browser>>,
    act: ReturnType<typeof createRouterAct>,
    pathname: string
  ) {
    await act(async () => {
      await browser
        .elementByCss(`input[data-link-accordion="${pathname}"]`)
        .click()
      await browser.elementByCss(`a[href="${pathname}"]`).click()
    })
  }

  it('renders metadata and CSS for a route with only named slots', async () => {
    const browser = await next.browser('/success')

    expect(await browser.elementByCss('#named-slot-page').text()).toBe(
      'Named slot page: success'
    )
    expect(await browser.eval('document.title')).toBe('Named slot: success')
    expect(
      await browser.elementByCss('#named-slot-page').getComputedCss('color')
    ).toBe('rgb(12, 34, 56)')
  })

  it('still attaches a regular error boundary to a named slot', async () => {
    const browser = await next.browser('/render-error')

    expect(await browser.elementByCss('#root-error').text()).toContain(
      'Root error:'
    )

    const { act, browser: navigationBrowser } =
      await createBrowserWithAct('/success')
    await navigate(navigationBrowser, act, '/render-error')
    expect(
      await navigationBrowser.elementByCss('#root-error').text()
    ).toContain('Root error:')
  })

  describe('HTTP access fallbacks', () => {
    const cases = [
      {
        route: 'not-found',
        status: 200,
        boundaryId: 'root-not-found',
        boundaryText: 'Root not found',
      },
      {
        route: 'forbidden',
        status: 200,
        boundaryId: 'root-forbidden',
        boundaryText: 'Root forbidden',
      },
      {
        route: 'unauthorized',
        status: 200,
        boundaryId: 'root-unauthorized',
        boundaryText: 'Root unauthorized',
      },
      {
        route: 'metadata-not-found',
        status: 200,
        boundaryId: 'root-not-found',
        boundaryText: 'Root not found',
      },
      {
        route: 'metadata-forbidden',
        status: 200,
        boundaryId: 'root-forbidden',
        boundaryText: 'Root forbidden',
      },
      {
        route: 'metadata-unauthorized',
        status: 200,
        boundaryId: 'root-unauthorized',
        boundaryText: 'Root unauthorized',
      },
    ]

    it.each(cases)(
      'documents that $route does not render the root boundary',
      async ({ route, status, boundaryId, boundaryText }) => {
        const response = await next.fetch(`/${route}`)
        // The access error is streamed after the Suspense shell has committed
        // a successful response.
        expect(response.status).toBe(status)

        // TODO(explicit-parallel-route-children): This intentionally asserts the current
        // broken behavior. HTTP access boundaries are only assigned to the
        // `children` LayoutRouter, so a named-only root cannot render its own
        // boundary. Flip this assertion once boundaries belong to the layout
        // instead of one particular slot.
        expect(await response.text()).not.toContain(boundaryText)

        const { act, browser } = await createBrowserWithAct('/success')
        await navigate(browser, act, `/${route}`)
        expect(await browser.hasElementByCss(`#${boundaryId}`)).toBe(false)
      }
    )
  })

  describe('metadata error delivery', () => {
    it('delivers metadata errors without children', async () => {
      const route = 'metadata-error'
      const response = await next.fetch(`/${route}`, {
        redirect: 'manual',
      })

      // The metadata error is streamed after the response has committed.
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()

      const browser = await next.browser(`/${route}`)
      expect(await browser.elementByCss('#root-error').text()).toContain(
        'Root error:'
      )

      const { act, browser: navigationBrowser } =
        await createBrowserWithAct('/success')
      await navigate(navigationBrowser, act, `/${route}`)
      expect(
        await navigationBrowser.elementByCss('#root-error').text()
      ).toContain('Root error:')
    })

    it('delivers metadata redirects without children', async () => {
      const response = await next.fetch('/metadata-redirect', {
        redirect: 'manual',
      })

      // The metadata redirect is streamed after the response has committed.
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()

      const browser = await next.browser('/metadata-redirect')
      await retry(async () => {
        expect(new URL(await browser.url()).pathname).toBe('/success')
        expect(await browser.elementByCss('#named-slot-page').text()).toBe(
          'Named slot page: success'
        )
      })

      const { act, browser: navigationBrowser } =
        await createBrowserWithAct('/other')
      await navigate(navigationBrowser, act, '/metadata-redirect')
      expect(new URL(await navigationBrowser.url()).pathname).toBe('/success')
      expect(
        await navigationBrowser.elementByCss('#named-slot-page').text()
      ).toBe('Named slot page: success')
    })
  })
})
