import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  // getInitialProps values are merged into the App component's props.
  const value: string = foo
  void value
  return <Component {...pageProps} />
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
