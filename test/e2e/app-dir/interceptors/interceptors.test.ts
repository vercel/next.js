import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import { retry } from 'next-test-utils'

const timeStampRegExp = /[ ]*\d{2}:\d{2}:\d{2}\.\d{3}[ ]*/gm

describe('interceptors', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputLength: number

  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  if (isTurbopack) {
    return it.skip('TODO(interceptors): support turbopack', () => {})
  }

  if (isNextStart) {
    it('should build all pages with interceptors as dynamic functions', () => {
      expect(next.cliOutput).toInclude('ƒ / ')
      expect(next.cliOutput).toInclude('ƒ /_not-found ')
      expect(next.cliOutput).toInclude('ƒ /nested ')
      expect(next.cliOutput).toInclude('ƒ /nested/[slug] ')
    })
  }

  it('should intercept requests at the root', async () => {
    const browser = await next.browser('/')

    expect(
      (await browser.elementByCss('p').text()).replace(timeStampRegExp, '')
    ).toBe('root page')

    const cliOutput = next.cliOutput.slice(cliOutputLength)

    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootLayout, start
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/
      RootLoading
      RootLayout, finish
      RootInterceptor, finish
      RootPage, start
      RootPage, finish
    `)
  })

  it('should intercept requests deeply nested', async () => {
    const browser = await next.browser('/nested/deep')

    expect(
      (await browser.elementByCss('p').text()).replace(timeStampRegExp, '')
    ).toBe('deeply nested page')

    const cliOutput = next.cliOutput.slice(cliOutputLength)

    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootLayout, start
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/nested/deep
      RootLoading
      RootLayout, finish
      RootInterceptor, finish
      NestedInterceptor, start
      NestedLayout, start
      NestedLoading
      NestedLayout, finish
      NestedInterceptor, finish
      DeeplyNestedInterceptor, start
      DeeplyNestedInterceptor, finish
      DeeplyNestedPage, start
      DeeplyNestedPage, finish
    `)
  })

  it('should intercept requests for client-side navigation', async () => {
    const browser = await next.browser('/nested/foo')

    expect(await browser.elementByCss('h3').text()).toBe('foo')

    expect(
      (await browser.elementByCss('p').text()).replace(timeStampRegExp, '')
    ).toBe('deeply nested page')

    cliOutputLength = next.cliOutput.length

    await browser.elementByCss('a[href="/nested/bar"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('h3').text()).toBe('bar')
    })

    const cliOutput = next.cliOutput.slice(cliOutputLength)

    const cleanedOutput = cliOutput
      .replace(timeStampRegExp, '')
      // TODO(interceptors): the _rsc query param should not be exposed here.
      .replace(/\?_rsc=\w+/, '')

    // We expect the full interceptor chain to be executed again, even if only
    // the page is rendered because the layouts are shared.
    expect(cleanedOutput).toMatch(outdent`
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/nested/bar
      RootInterceptor, finish
      NestedInterceptor, start
      NestedInterceptor, finish
      DeeplyNestedInterceptor, start
      DeeplyNestedInterceptor, finish
      DeeplyNestedPage, start
      DeeplyNestedPage, finish
    `)
  })

  it('should render error boundary when error is thrown', async () => {
    const browser = await next.browser('/nested/deep?error')

    expect(await browser.elementByCss('h3').text()).toBe(
      'Something went wrong!'
    )

    expect(next.cliOutput.slice(cliOutputLength)).not.toInclude(
      'DeeplyNestedPage'
    )
  })
})
