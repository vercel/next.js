import { deserializeContext } from '@fleur/next'
import { FleurContext } from '@fleur/react'
import { AppProps } from 'next/dist/next-server/lib/router/router'
import { getOrCreateFleurContext } from '../lib/fleur'

export default function FleurApp({ Component, pageProps }: AppProps) {
  const fleurContext = getOrCreateFleurContext(
    deserializeContext(pageProps.__FLEUR_STATE__)
  )

  return (
    <FleurContext value={fleurContext}>
      <Component {...pageProps} />
    </FleurContext>
  )
}

// You can fetch data you need in before page rendering
// import App from 'next/app'
// import { bindFleurContext, FleurishNextAppContext } from '@fleur/next'

// FleurApp.getInitialProps = async (context: FleurishNextAppContext) => {
//   const fleurContext = getOrCreateFleurContext()
//   const appContext = bindFleurContext(fleurContext, context)

//   // Example: await appContext.executeOperation(AppOps.fetchSession)

//   return App.getInitialProps(appContext)
// }
