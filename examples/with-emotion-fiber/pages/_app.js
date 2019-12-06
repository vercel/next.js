import * as React from 'react'
import NextApp from 'next/app'
import { CacheProvider } from '@emotion/core'
import { globalStyles } from '../shared/styles'
import { emotionCache } from '../shared/emotionCache'

export default class App extends NextApp {
  render() {
    const { Component, pageProps } = this.props
    return (
      <CacheProvider value={emotionCache}>
        {globalStyles}
        <Component {...pageProps} />
      </CacheProvider>
    )
  }
}
