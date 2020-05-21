import App from 'next/app'
import React from 'react'
import WithStylesContext from 'react-with-styles/lib/WithStylesContext'
import AphroditeInterface from 'react-with-styles-interface-aphrodite'
import { DIRECTIONS } from 'react-with-direction'

import defaultTheme from '../defaultTheme'

class MyApp extends App {
  render() {
    const { Component, pageProps } = this.props

    return (
      <WithStylesContext.Provider
        value={{
          stylesInterface: AphroditeInterface,
          stylesTheme: defaultTheme,
          direction: DIRECTIONS.LTR,
        }}
      >
        <Component {...pageProps} />
      </WithStylesContext.Provider>
    )
  }
}

export default MyApp
