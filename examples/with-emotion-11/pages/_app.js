import * as React from 'react'
import NextApp from 'next/app'
import { CacheProvider } from '@emotion/react'
import { cache } from '@emotion/css'
import { globalStyles } from '../shared/styles'

export default class App extends NextApp {
  render() {
    const { Component, pageProps } = this.props
    return (
      <CacheProvider value={cache}>
        {globalStyles}
        <Component {...pageProps} />
      </CacheProvider>
    )
  }
}
