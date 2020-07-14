import React from 'react'
import { AppProps } from 'next/app'

import { wrapper } from '../store'
import 'components/layouts/layout.css'

function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default wrapper.withRedux(App)
