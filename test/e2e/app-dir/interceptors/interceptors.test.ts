import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import { retry } from 'next-test-utils'

const timeStampRegExp = /[ ]*\d{2}:\d{2}:\d{2}\.\d{3}[ ]*/gm

describe('interceptors', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputLength: number

  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  if (isNextStart) {
    if (process.env.__NEXT_EXPERIMENTAL_PPR) {
      it('should build all pages with interceptors as partial prerenders', () => {
        expect(next.cliOutput).toInclude('◐ / ')
        expect(next.cliOutput).toInclude('○ /_not-found ')
        expect(next.cliOutput).toInclude('◐ /nested ')
        expect(next.cliOutput).toInclude('◐ /nested/[slug] ')
      })
    } else {
      it('should build all pages with interceptors as dynamic functions', () => {
        expect(next.cliOutput).toInclude('ƒ / ')
        expect(next.cliOutput).toInclude('ƒ /_not-found ')
        expect(next.cliOutput).toInclude('ƒ /nested ')
        expect(next.cliOutput).toInclude('ƒ /nested/[slug] ')
      })
    }
  }

  it('should intercept requests at the root', async () => {
    const browser = await next.browser('/')

    expect(
      (await browser.elementByCss('p').text()).replace(timeStampRegExp, '')
    ).toBe('root page')

    const cliOutput = next.cliOutput.slice(cliOutputLength)

    // The root layout being rendered twice is due to a hack in
    // createComponentTree, see comment "TODO-APP: This is a hack to support
    // unmatched parallel routes..."
    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootLayout, start
      RootLayout, start
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/
      RootLoading
      RootLayout, finish
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

    if (isNextStart && process.env.__NEXT_EXPERIMENTAL_PPR) {
      // On the first request there's also the route shell generated in the
      // background, which will mix into the cli output. So we refresh the page
      // to get isolated output for the actual page rendering.
      await browser.refresh()
    }

    const cliOutput = next.cliOutput.slice(cliOutputLength)

    // The root layout being rendered twice is due to a hack in
    // createComponentTree, see comment "TODO-APP: This is a hack to support
    // unmatched parallel routes..."
    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootLayout, start
      RootLayout, start
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/nested/deep
      RootLoading
      RootLayout, finish
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

  it('can seed the react cache for the current request', async () => {
    const browser = await next.browser('/nested?seed-react-cache')

    const renderedValue = await browser
      .elementByCss('p[data-testid="data"]')
      .text()

    // The logged value from the interceptor should be the same as the rendered
    // value from the page.
    expect(next.cliOutput.slice(cliOutputLength)).toInclude(
      `{ data: '${renderedValue}' }`
    )
  })

  it('should run interceptors for parallel routes at the same level concurrently', async () => {
    await next.browser('/action')
    const cliOutput = next.cliOutput.slice(cliOutputLength)

    // SlotInterceptor and ActionInterceptor should start at the same time.
    // TODO(interceptors): Should ActionPage be allowed to render before
    // SlotInterceptor has finished, i.e. do we need to await sibling
    // interceptors for parallel routes?
    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootLayout, start
      RootLayout, start
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/action
      RootLoading
      RootLayout, finish
      RootLayout, finish
      RootInterceptor, finish
      SlotInterceptor, start
      ActionInterceptor, start
      ActionInterceptor, finish
      ActionPage, start
      ActionPage, finish
      SlotInterceptor, finish
      SlotPage, start
      SlotPage, finish
    `)
  })

  it('should intercept requests for server actions', async () => {
    const browser = await next.browser('/action')
    cliOutputLength = next.cliOutput.length
    await browser.elementByCss('button').click()
    await browser.waitForIdleNetwork()
    const cliOutput = next.cliOutput.slice(cliOutputLength)

    expect(cliOutput.replace(timeStampRegExp, '')).toMatch(outdent`
      RootInterceptor, start
      URL: http://localhost:${next.appPort}/action
      RootInterceptor, finish
      SlotInterceptor, start
      ActionInterceptor, start
      ActionInterceptor, finish
      SlotInterceptor, finish
      Action!
    `)
  })
})
