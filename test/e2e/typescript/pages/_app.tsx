import type { AppType } from 'next/app'

const MyApp: AppType<{}, { foo: string }> = ({
  Component,
  pageProps,
  foo,
}) => {
  const appProp: string = foo
  void appProp

  // @ts-expect-error foo is a custom App prop, not a page prop
  pageProps.foo

  return <Component {...pageProps} />
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
