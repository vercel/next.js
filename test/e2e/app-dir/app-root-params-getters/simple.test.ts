import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'
import { join } from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('app-root-param-getters - simple', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
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
    expect($('p#dynamic-params').text()).toBe(dynamicParams.slug)
    expect($('p#root-params').text()).toBe(JSON.stringify(rootParams))
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

  // root params currently don't work in route handlers.
  it.failing(
    'should allow reading root params in a route handler',
    async () => {
      const params = { lang: 'en', locale: 'us' }
      const response = await next.fetch(
        `/${params.lang}/${params.locale}/route-handler`
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(params)
    }
  )
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
