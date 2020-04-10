import React from 'react'
import { wrapper } from '../store/store'

const MyApp = props => {
  const { Component, pageProps } = props
  return <Component {...pageProps} />
}

MyApp.getInitialProps = wrapper.getInitialAppProps(
  async ({ ctx, Component }) => {
    return {
      pageProps: {
        ...(Component.getInitialProps
          ? await Component.getInitialProps(ctx)
          : {}),
      },
    }
  }
)

export default wrapper.withRedux(MyApp)
