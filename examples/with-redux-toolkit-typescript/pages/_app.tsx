import React, { ComponentType } from 'react'
import { Provider } from 'react-redux'
import { AppInitialProps } from 'next/app'

import store from '../src/store'

const MyApp = ({
  Component,
  pageProps,
}: {
  Component: ComponentType<AppInitialProps>
  pageProps: AppInitialProps
}) => {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  )
}

export default MyApp
