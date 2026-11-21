import type { AppType } from 'next/dist/shared/lib/utils'
import { expectTypeOf } from 'expect-type'

describe('AppType', () => {
  it('should apply initial props generic to App component props, not pageProps', () => {
    type MyInitialProps = { foo: string }
    type MyAppType = AppType<MyInitialProps>

    type AppProps = Parameters<MyAppType>[0]
    expectTypeOf<AppProps>().toMatchTypeOf<{ foo: string }>()
  })

  it('should support custom pageProps generic', () => {
    type MyInitialProps = { foo: string }
    type MyPageProps = { bar: number }
    type MyAppType = AppType<MyInitialProps, MyPageProps>

    type AppProps = Parameters<MyAppType>[0]
    expectTypeOf<AppProps>().toMatchTypeOf<{
      foo: string
      pageProps: { bar: number }
    }>()
  })

  it('should default to empty object and any pageProps when no generics provided', () => {
    type DefaultAppType = AppType

    type AppProps = Parameters<DefaultAppType>[0]
    expectTypeOf<AppProps>().toBeObject()
  })
})
