import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  // The getInitialProps value belongs to the App component's props, not pageProps.
  void foo
  return <Component {...pageProps} />
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
