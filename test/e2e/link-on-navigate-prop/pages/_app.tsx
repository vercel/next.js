import React from 'react'
import type { AppProps } from 'next/app'
import OnNavigate from '../shared/OnNavigate'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <OnNavigate rootPath="/pages-router">
      <Component {...pageProps} />
    </OnNavigate>
  )
}
