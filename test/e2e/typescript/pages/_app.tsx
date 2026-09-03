import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  // @ts-expect-error AppType's parameter applies to app props, not page props.
  type _PageFoo = typeof pageProps.foo

  return (
    <>
      <p id="app-prop">{foo}</p>
      <Component {...pageProps} />
    </>
  )
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
