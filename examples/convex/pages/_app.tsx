import '../styles/globals.css'
import type { AppProps } from 'next/app'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL)

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ConvexProvider client={convex}>
      <Component {...pageProps} />
    </ConvexProvider>
  )
}

export default MyApp
