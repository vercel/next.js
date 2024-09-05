import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'

const timeStampRegExp = /[ ]*\d{2}:\d{2}:\d{2}\.\d{3}[ ]*/gm

describe('interceptors', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputLength: number

  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  if (!isNextDev) {
    return it.skip('TODO(interceptors): support next build', () => {})
  }

  if (isTurbopack) {
    return it.skip('TODO(interceptors): support turbopack', () => {})
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
      NestedInterceptor, finish
      DeeplyNestedInterceptor, start
      NestedLayout, finish
      DeeplyNestedInterceptor, finish
      DeeplyNestedPage, start
      DeeplyNestedPage, finish
    `)
  })
})
