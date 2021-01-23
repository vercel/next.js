import { deserializeContext, NextJsOps } from '@fleur/next'
import { FleurContext } from '@fleur/react'
import { AppProps } from 'next/dist/next-server/lib/router/router'
import { useRef } from 'react'
import { useEffect } from 'react'
import { getOrCreateFleurContext } from '../lib/fleur'

export default function FleurApp({
  Component,
  pageProps: { __FLEUR_STATE__, ...pageProps },
}: AppProps) {
  const isFirstRendering = useRef<boolean>(true)

  const fleurContext = getOrCreateFleurContext(
    deserializeContext(__FLEUR_STATE__)
  )

  useEffect(() => {
    if (isFirstRendering.current) return
    if (__FLEUR_STATE__ == null) return

    // Rehydrate page state on client side page transition
    fleurContext.executeOperation(
      NextJsOps.rehydrateServerSideProps,
      deserializeContext(__FLEUR_STATE__)
    )
  }, [__FLEUR_STATE__, fleurContext])

  useEffect(() => {
    isFirstRendering.current = false
  }, [])

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
