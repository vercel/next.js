import App, { AppContext, AppProps } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  const appProps = await App.getInitialProps(appContext)

  // This should NOT override ISR cache-control headers
  if (appContext.ctx.res) {
    appContext.ctx.res.setHeader('Cache-Control', 'max-age=0, must-revalidate')
    appContext.ctx.res.setHeader('x-from-app', 'true')
  }

  return { ...appProps }
}

export default MyApp
