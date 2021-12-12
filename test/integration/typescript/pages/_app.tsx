import App from 'next/app'
import type { AppType } from 'next/app'

const MyApp: AppType<{ propA: string; propB: string }, { propB: string }> = ({
  Component,
  pageProps,
}) => {
  return <Component {...pageProps} propA="propA" />
}

// Only use this method if you have blocking data requirements for
// every single page in your application. This disables the ability to
// perform automatic static optimization, causing every page in your app to
// be server-side rendered.

MyApp.getInitialProps = async (appContext) => {
  // calls page's `getInitialProps` and fills `appProps.pageProps`
  const appProps = await App.getInitialProps(appContext)

  return { ...appProps }
}

export default MyApp
