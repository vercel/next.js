import { bindFleurContext, FleurishNextAppContext } from '@fleur/next'
import App from 'next/app'
import { FleurContext } from '@fleur/react'
import { AppProps } from 'next/dist/next-server/lib/router/router'
import { getOrCreateFleurContext } from '../lib/fleur'

function FleurApp({ Component, pageProps }: AppProps) {
  const fleurContext = getOrCreateFleurContext(pageProps.__FLEUR_STATE__)

  return (
    <FleurContext value={fleurContext}>
      <Component {...pageProps} />
    </FleurContext>
  )
}

FleurApp.getInitialProps = async (context: FleurishNextAppContext) => {
  const fleurContext = getOrCreateFleurContext()
  const appContext = bindFleurContext(fleurContext, context)

  // You can fetch data you need in advance here
  // Example: await appContext.executeOperation(AppOps.fetchSession)

  const appProps = await App.getInitialProps(appContext)

  return appProps
}

export default FleurApp
