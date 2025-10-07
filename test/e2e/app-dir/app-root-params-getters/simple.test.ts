import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'
import { join } from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'
import { createRequestTracker } from '../../../lib/e2e-utils/request-tracker'

describe('app-root-param-getters - simple', () => {
  let currentCliOutputIndex = 0
  beforeEach(() => {
    resetCliOutput()
  })

  const getCliOutput = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const resetCliOutput = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  const { next, isNextDev, isTurbopack, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'simple'),
  })

  it('should allow reading root params', async () => {
    const params = { lang: 'en', locale: 'us' }
    const $ = await next.render$(`/${params.lang}/${params.locale}`)
    expect($('p').text()).toBe(`hello world ${JSON.stringify(params)}`)
  })

  it('should allow reading root params in nested pages', async () => {
    const rootParams = { lang: 'en', locale: 'us' }
    const dynamicParams = { slug: '1' }
    const $ = await next.render$(
      `/${rootParams.lang}/${rootParams.locale}/other/${dynamicParams.slug}`
    )
    expect($('#dynamic-params').text()).toBe(dynamicParams.slug)
    expect($('#root-params').text()).toBe(JSON.stringify(rootParams))
  })

  it('should allow reading catch-all root params', async () => {
    const params = { path: ['foo', 'bar'] }
    const $ = await next.render$(`/catch-all/${params.path.join('/')}`)
    expect($('p').text()).toBe(JSON.stringify(params))
  })

  it('should allow reading optional catch-all root params', async () => {
    {
      const params = { path: undefined }
      const $ = await next.render$(`/optional-catch-all`)
      expect($('p').text()).toBe(JSON.stringify(params))
    }
    {
      const params = { path: ['foo', 'bar'] }
      const $ = await next.render$(
        `/optional-catch-all/${params.path.join('/')}`
      )
      expect($('p').text()).toBe(JSON.stringify(params))
    }
  })

  it('should render the not found page without errors', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page could not be found.'
    )
    if (isNextDev) {
      await assertNoRedbox(browser)
    }
  })

  if (isNextDev) {
    it('should not generate getters for non-root params', async () => {
      const rootParams = { lang: 'en', locale: 'us' }
      const dynamicParams = { slug: 'foo' }

      await using _sandbox = await createSandbox(
        next,
        new Map([
          [
            'app/[lang]/[locale]/other/[slug]/page.tsx',
            outdent`
              import { lang, locale, slug } from 'next/root-params';
              export default async function Page() {
                return JSON.stringify({ lang: await lang(), locale: await locale(), slug: await slug() });
              }
            `,
          ],
        ]),
        `/${rootParams.lang}/${rootParams.locale}/other/${dynamicParams.slug}`
      )
      // Workaround: `createSandbox` stops next and does not restart it, so subsequent tests would fail
      afterCurrentTest(() => next.start())

      await retry(() => {
        expect(next.cliOutput).toContain(
          isTurbopack
            ? `Export slug doesn't exist in target module`
            : `Attempted import error: 'slug' is not exported from 'next/root-params' (imported as 'slug').`
        )
      })
    })
  }

  it('should error when used in a server action', async () => {
    const params = { lang: 'en', locale: 'us' }
    const browser = await next.browser(
      `/${params.lang}/${params.locale}/server-action`
    )
    const tracker = createRequestTracker(browser)
    const [, response] = await tracker.captureResponse(
      async () => {
        await browser.elementByCss('button[type="submit"]').click()
      },
      {
        request: {
          method: 'POST',
          pathname: `/${params.lang}/${params.locale}/server-action`,
        },
      }
    )
    expect(response.status()).toBe(500)
    if (!isNextDeploy) {
      expect(getCliOutput()).toInclude(
        "`import('next/root-params').lang()` was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route."
      )
    }
  })

  it('should not error when rerendering the page after a server action', async () => {
    const params = { lang: 'en', locale: 'us' }
    const browser = await next.browser(
      `/${params.lang}/${params.locale}/rerender-after-server-action`
    )
    expect(await browser.elementById('root-params').text()).toBe(
      `${params.lang} ${params.locale}`
    )
    const initialDate = await browser.elementById('timestamp')

    // Run a server action and rerender the page
    const tracker = createRequestTracker(browser)
    const [, response] = await tracker.captureResponse(
      async () => {
        await browser.elementByCss('button[type="submit"]').click()
      },
      {
        request: {
          method: 'POST',
          pathname: `/${params.lang}/${params.locale}/rerender-after-server-action`,
        },
      }
    )
    // We're using lang() outside of an action, so we should see no errors
    expect(response.status()).toBe(200)
    if (!isNextDeploy) {
      expect(getCliOutput()).not.toInclude(
        "`import('next/root-params').lang()` was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route."
      )
    }

    await retry(async () => {
      // The page should've been rerendered because of the cookie update
      const updatedDate = await browser.elementById('timestamp')
      expect(initialDate).not.toEqual(updatedDate)
    })

    // It should still display correct root params
    expect(await browser.elementById('root-params').text()).toBe(
      `${params.lang} ${params.locale}`
    )
  })

  // TODO(root-params): add support for route handlers
  it('should error when used in a route handler (until we implement it)', async () => {
    const params = { lang: 'en', locale: 'us' }
    const response = await next.fetch(
      `/${params.lang}/${params.locale}/route-handler`
    )
    expect(response.status).toBe(500)
    if (!isNextDeploy) {
      expect(getCliOutput()).toInclude(
        "Route /[lang]/[locale]/route-handler used `import('next/root-params').lang()` inside a Route Handler. Support for this API in Route Handlers is planned for a future version of Next.js."
      )
    }
  })
})

/** Run cleanup after the current test. */
const createAfterCurrentTest = () => {
  type Callback = () => void | Promise<void>
  let callbacks: Callback[] = []

  afterEach(async () => {
    if (!callbacks.length) {
      return
    }
    const currentCallbacks = callbacks
    callbacks = []
    for (const callback of currentCallbacks) {
      await callback()
    }
  })

  return function afterCurrentTest(cb: () => void | Promise<void>) {
    callbacks.push(cb)
  }
}

const afterCurrentTest = createAfterCurrentTest()
